package com.maxsolch.shop.support.app;

import com.maxsolch.shop.support.domain.SupportError;
import com.maxsolch.shop.platform.web.TopicMessagePosted;
import com.maxsolch.shop.support.domain.SupportEvents;

import com.maxsolch.shop.support.domain.SupportMessage;
import com.maxsolch.shop.support.domain.SupportStatus;
import com.maxsolch.shop.support.domain.SupportThread;
import com.maxsolch.shop.support.infra.SupportMessageRepository;
import com.maxsolch.shop.support.infra.SupportThreadRepository;

import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.order.domain.MessageType;
import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.catalog.domain.ProductImage;
import com.maxsolch.shop.order.domain.SenderType;
import com.maxsolch.shop.platform.i18n.Messages;
import com.maxsolch.shop.catalog.app.Products;
import com.maxsolch.shop.customer.app.Customers;
import com.maxsolch.shop.platform.settings.SettingsRegistry;
import com.maxsolch.shop.platform.settings.SettingsService;
import com.maxsolch.shop.support.app.SupportDtos.ConfigDto;
import com.maxsolch.shop.support.app.SupportDtos.CreateThreadRequest;
import com.maxsolch.shop.support.app.SupportDtos.ThreadDto;
import com.maxsolch.shop.order.app.SendMessageRequest;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.tx.DomainEvents;
import com.maxsolch.shop.support.app.SupportDtos.MessageDto;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

import static com.maxsolch.shop.platform.util.Texts.ellipsize;

/**
 * Support threads: customer questions that are not about an order (a product before buying it, or
 * a general one). Persistence, the customer limits from «Настройки → Поддержка», realtime fan-out on
 * {@code /topic/support/{threadId}} and the notification events.
 *
 * <p>Like the order chat, the STOMP broadcast happens after the commit and the Telegram / push side
 * is driven by {@link SupportEvents.MessagePosted} after the commit too.
 */
@Slf4j
@Service
public class SupportService {

    /** Default page size of a thread — same as the order chat. */
    public static final int DEFAULT_PAGE = 50;
    private static final int MAX_PAGE = 200;
    private static final int ADMIN_LIST_DEFAULT = 100;
    private static final int ADMIN_LIST_MAX = 500;
    private static final int PREVIEW_MAX = 200;
    private static final int SUBJECT_MAX = 255;
    /** Auto-close works in batches so one run never loads the whole table. */
    private static final int AUTO_CLOSE_BATCH = 500;

    public static final String SOURCE_MINIAPP = "MINIAPP";
    public static final String SOURCE_WEB = "WEB";

    private final SupportThreadRepository threads;
    private final SupportMessageRepository messageRepository;
    private final Products productRepository;
    private final Customers userRepository;
    private final SettingsService settings;
    private final SupportLimits limits;
    private final SupportMapper mapper;
    private final DomainEvents events;
    private final Messages messages;
    private final Clock clock;

    public SupportService(SupportThreadRepository threads,
                          SupportMessageRepository messageRepository,
                          Products productRepository,
                          Customers userRepository,
                          SettingsService settings,
                          SupportLimits limits,
                          SupportMapper mapper,
                          DomainEvents events,
                          Messages messages,
                          Clock clock) {
        this.threads = threads;
        this.messageRepository = messageRepository;
        this.productRepository = productRepository;
        this.userRepository = userRepository;
        this.settings = settings;
        this.limits = limits;
        this.mapper = mapper;
        this.events = events;
        this.messages = messages;
        this.clock = clock;
    }

    public ConfigDto config() {
        return limits.config();
    }

    // ------------------------------------------------------------------ customer

    @Transactional(readOnly = true)
    public List<ThreadDto> listMine(long userId) {
        return threads.findTop100ByUserIdOrderByLastMessageAtDesc(userId).stream()
                .map(t -> mapper.toDto(t, false))
                .toList();
    }

    @Transactional(readOnly = true)
    public ThreadDto getMine(long userId, String threadId) {
        return mapper.toDto(owned(userId, threadId), false);
    }

    @Transactional(readOnly = true)
    public List<MessageDto> messagesMine(long userId, String threadId, Long before, Integer limit) {
        return page(owned(userId, threadId).getId(), before, limit);
    }

    /** Unread shop messages across all of the customer's threads (badge). */
    @Transactional(readOnly = true)
    public long unreadForCustomer(long userId) {
        return threads.sumCustomerUnread(userId);
    }

    /**
     * Starts a thread with its first message. A question about a product the customer already has
     * an open thread about goes into that thread instead of opening a second one.
     *
     * @param source {@link #SOURCE_MINIAPP} or {@link #SOURCE_WEB}
     */
    @Transactional
    public ThreadDto create(long userId, String source, CreateThreadRequest req) {
        if (req == null) {
            throw new DomainException.BadRequest(SupportError.NEEDS_CONTENT);
        }
        SendMessageRequest first = new SendMessageRequest(req.text(), req.type(), req.attachmentUrl(),
                req.fileName(), req.mimeType(), null);
        Instant now = clock.instant();
        limits.requireEnabled();
        limits.validateContent(userId, first);
        limits.checkRate(userId, now);

        Product product = null;
        if (req.productId() != null && !req.productId().isBlank()) {
            product = product(req.productId());
            Optional<SupportThread> existing = threads.findOpenForProduct(userId, product.getId());
            if (existing.isPresent()) {
                SupportThread t = threads.findForUpdate(existing.get().getId()).orElse(existing.get());
                postCustomer(t, userId, first, now, false);
                return mapper.toDto(t, false);
            }
        }
        limits.requireThreadSlot(userId);

        SupportThread t = new SupportThread();
        t.setId(UuidUtil.randomBytes());
        t.setUserId(userId);
        t.setTgUserId(userId > 0 ? userId : null);
        t.setCustomerName(customerName(userId));
        t.setSource(SOURCE_WEB.equals(source) ? SOURCE_WEB : SOURCE_MINIAPP);
        t.setStatus(SupportStatus.OPEN);
        t.setCreatedAt(now);
        t.setLastMessageAt(now);
        if (product != null) {
            t.setProductId(product.getId());
            t.setProductTitle(ellipsize(product.getTitle(), 255));
            t.setProductSlug(ellipsize(product.getSlug(), 255));
            t.setProductImageUrl(firstImage(product));
            t.setSubject(ellipsize(product.getTitle(), SUBJECT_MAX));
        } else {
            String subject = req.subject() == null ? null : req.subject().strip();
            t.setSubject(subject == null || subject.isEmpty() ? null : ellipsize(subject, SUBJECT_MAX));
        }
        threads.saveAndFlush(t);
        postCustomer(t, userId, first, now, true);
        return mapper.toDto(t, false);
    }

    /** A customer message in their own thread; writing into a closed thread reopens it. */
    @Transactional
    public MessageDto sendAsCustomer(long userId, String threadId, SendMessageRequest req) {
        Instant now = clock.instant();
        limits.requireEnabled();
        limits.validateContent(userId, req);
        SupportThread t = ownedForUpdate(userId, threadId);
        limits.checkRate(userId, now);
        if (t.getStatus() == SupportStatus.CLOSED) {
            limits.requireThreadSlot(userId);
        }
        return postCustomer(t, userId, req, now, false);
    }

    @Transactional
    public void markReadByCustomer(long userId, String threadId) {
        byte[] id = owned(userId, threadId).getId();
        messageRepository.markRead(id, SenderType.ADMIN, clock.instant());
        threads.findById(id).ifPresent(t -> {
            t.setCustomerUnread(0);
            threads.save(t);
        });
    }

    @Transactional
    public ThreadDto closeByCustomer(long userId, String threadId) {
        SupportThread t = ownedForUpdate(userId, threadId);
        close(t, "CUSTOMER");
        return mapper.toDto(t, false);
    }

    // ------------------------------------------------------------------ admin

    /**
     * @param filter open (default) | awaiting/unanswered | closed | all
     * @param q      customer name / product title fragment, may be blank
     */
    @Transactional(readOnly = true)
    public List<ThreadDto> adminList(String filter, String q, Integer limit) {
        String f = filter == null ? "open" : filter.trim().toLowerCase(Locale.ROOT);
        SupportStatus status = switch (f) {
            case "all" -> null;
            case "closed" -> SupportStatus.CLOSED;
            default -> SupportStatus.OPEN;
        };
        boolean awaiting = "awaiting".equals(f) || "unanswered".equals(f);
        String like = q == null || q.isBlank() ? null
                : "%" + q.trim().toLowerCase(Locale.ROOT).replace("%", "").replace("_", "") + "%";
        int size = Math.min(Math.max(1, limit == null ? ADMIN_LIST_DEFAULT : limit), ADMIN_LIST_MAX);
        return threads.adminList(status, awaiting, like, PageRequest.of(0, size)).stream()
                .map(t -> mapper.toDto(t, true))
                .toList();
    }

    @Transactional(readOnly = true)
    public ThreadDto adminGet(String threadId) {
        return mapper.toDto(load(threadId), true);
    }

    @Transactional(readOnly = true)
    public List<MessageDto> adminMessages(String threadId, Long before, Integer limit) {
        return page(load(threadId).getId(), before, limit);
    }

    /** Admin reply: the customer gets it live and as a bot DM; a closed thread reopens. */
    @Transactional
    public MessageDto sendAsAdmin(String threadId, Long adminId, String adminName, SendMessageRequest req) {
        byte[] id = load(threadId).getId();
        Instant now = clock.instant();
        limits.requireContent(req);
        // Answering means the customer's messages have been read.
        messageRepository.markRead(id, SenderType.CUSTOMER, now);
        SupportThread t = threads.findForUpdate(id)
                .orElseThrow(() -> new DomainException.NotFound(SupportError.THREAD_NOT_FOUND));
        SupportMessage m = persist(t.getId(), SenderType.ADMIN, adminId, adminName, req, now);
        if (t.getStatus() == SupportStatus.CLOSED) {
            reopen(t);
        }
        t.setLastMessageAt(now);
        t.setLastSender(SenderType.ADMIN);
        t.setLastPreview(ellipsize(SupportMapper.previewOf(m), PREVIEW_MAX));
        t.setCustomerUnread(t.getCustomerUnread() + 1);
        t.setAdminUnread(0);
        t.setAwaitingSince(null);
        threads.save(t);
        MessageDto dto = mapper.toDto(m);
        events.publish(new TopicMessagePosted("/topic/support/" + UuidUtil.toString(t.getId()), dto));
        events.publish(new SupportEvents.MessagePosted(t.getId(), true, false, SupportMapper.previewOf(m)));
        return dto;
    }

    @Transactional
    public void markReadByAdmin(String threadId) {
        byte[] id = load(threadId).getId();
        messageRepository.markRead(id, SenderType.CUSTOMER, clock.instant());
        threads.findById(id).ifPresent(t -> {
            t.setAdminUnread(0);
            threads.save(t);
        });
    }

    /** Admin «Закрыть»: also stops the thread waiting on «Внимание». */
    @Transactional
    public ThreadDto adminClose(String threadId) {
        SupportThread t = threads.findForUpdate(load(threadId).getId()).orElseThrow();
        close(t, "ADMIN");
        return mapper.toDto(t, true);
    }

    @Transactional
    public ThreadDto adminReopen(String threadId) {
        SupportThread t = threads.findForUpdate(load(threadId).getId()).orElseThrow();
        if (t.getStatus() == SupportStatus.CLOSED) {
            reopen(t);
            threads.save(t);
        }
        return mapper.toDto(t, true);
    }

    /** Open threads waiting for a shop answer (admin nav badge). */
    @Transactional(readOnly = true)
    public long countAwaiting() {
        return threads.countAwaiting();
    }

    /** Raw rows for «Внимание»: open threads waiting for an answer, longest wait first. */
    @Transactional(readOnly = true)
    public List<SupportThread> awaiting(int limit) {
        return threads.findAwaiting(PageRequest.of(0, Math.max(1, limit)));
    }

    // ------------------------------------------------------------------ STOMP / jobs

    /** Whether {@code userId} owns the thread (STOMP subscription check). */
    @Transactional(readOnly = true)
    public boolean isOwner(String threadId, long userId) {
        byte[] id;
        try {
            id = UuidUtil.toBytes(threadId);
        } catch (IllegalArgumentException e) {
            return false;
        }
        return threads.findById(id).map(t -> t.getUserId() != null && t.getUserId() == userId).orElse(false);
    }

    /**
     * Closes open threads without activity for {@code support.autoCloseDays} (0 = never). Threads
     * whose customer still waits for an answer are left open.
     *
     * @return how many were closed
     */
    @Transactional
    public int autoClose() {
        int days = settings.getInt(SettingsRegistry.SUPPORT_AUTO_CLOSE_DAYS);
        if (days <= 0) {
            return 0;
        }
        Instant cutoff = clock.instant().minus(Duration.ofDays(days));
        List<SupportThread> stale = threads.findInactive(cutoff, PageRequest.of(0, AUTO_CLOSE_BATCH));
        for (SupportThread t : stale) {
            close(t, "AUTO");
        }
        return stale.size();
    }

    // ------------------------------------------------------------------ internals

    private MessageDto postCustomer(SupportThread t, long userId, SendMessageRequest req, Instant now,
                                    boolean newThread) {
        String name = t.getCustomerName() != null ? t.getCustomerName() : customerName(userId);
        SupportMessage m = persist(t.getId(), SenderType.CUSTOMER, userId, name, req, now);
        if (t.getStatus() == SupportStatus.CLOSED) {
            reopen(t);
        }
        t.setLastMessageAt(now);
        t.setLastSender(SenderType.CUSTOMER);
        t.setLastPreview(ellipsize(SupportMapper.previewOf(m), PREVIEW_MAX));
        t.setAdminUnread(t.getAdminUnread() + 1);
        if (t.getAwaitingSince() == null) {
            t.setAwaitingSince(now);
        }
        threads.save(t);
        MessageDto dto = mapper.toDto(m);
        events.publish(new TopicMessagePosted("/topic/support/" + UuidUtil.toString(t.getId()), dto));
        events.publish(new SupportEvents.MessagePosted(t.getId(), false, newThread, SupportMapper.previewOf(m)));
        return dto;
    }

    private SupportMessage persist(byte[] threadId, SenderType sender, Long senderId, String senderName,
                                   SendMessageRequest req, Instant now) {
        SupportMessage m = new SupportMessage();
        m.setThreadId(threadId);
        m.setSenderType(sender);
        m.setSenderId(senderId);
        m.setSenderName(senderName == null ? null : ellipsize(senderName, 255));
        boolean hasAttachment = req.attachmentUrl() != null && !req.attachmentUrl().isBlank();
        MessageType type = parseType(req.type());
        if (type == MessageType.TEXT && hasAttachment) {
            type = req.mimeType() != null && !req.mimeType().startsWith("image/") ? MessageType.FILE : MessageType.PHOTO;
        }
        m.setType(type);
        String text = req.text() == null ? null : req.text().strip();
        m.setText(text == null || text.isEmpty() ? null : ellipsize(text, 8192));
        m.setAttachmentUrl(hasAttachment ? req.attachmentUrl().trim() : null);
        m.setFileName(req.fileName() == null ? null : ellipsize(req.fileName(), 512));
        m.setMimeType(req.mimeType() == null ? null : ellipsize(req.mimeType(), 128));
        m.setReplyToMessageId(req.replyToMessageId());
        m.setCreatedAt(now);
        return messageRepository.saveAndFlush(m);
    }

    private void close(SupportThread t, String by) {
        if (t.getStatus() == SupportStatus.CLOSED) {
            return;
        }
        t.setStatus(SupportStatus.CLOSED);
        t.setClosedAt(clock.instant());
        t.setClosedBy(by);
        t.setAwaitingSince(null);
        threads.save(t);
    }

    private static void reopen(SupportThread t) {
        t.setStatus(SupportStatus.OPEN);
        t.setClosedAt(null);
        t.setClosedBy(null);
    }

    private List<MessageDto> page(byte[] threadId, Long before, Integer limit) {
        int size = Math.min(Math.max(1, limit == null ? DEFAULT_PAGE : limit), MAX_PAGE);
        List<SupportMessage> page = messageRepository.findPage(threadId, before, PageRequest.of(0, size));
        List<MessageDto> out = new ArrayList<>(page.size());
        for (int i = page.size() - 1; i >= 0; i--) {
            out.add(mapper.toDto(page.get(i)));
        }
        return out;
    }

    private SupportThread owned(long userId, String threadId) {
        SupportThread t = load(threadId);
        requireOwner(t, userId);
        return t;
    }

    private SupportThread ownedForUpdate(long userId, String threadId) {
        SupportThread t = threads.findForUpdate(parseId(threadId))
                .orElseThrow(() -> new DomainException.NotFound(SupportError.THREAD_NOT_FOUND));
        requireOwner(t, userId);
        return t;
    }

    private void requireOwner(SupportThread t, long userId) {
        if (t.getUserId() == null || t.getUserId() != userId) {
            throw new DomainException.Forbidden(SupportError.NOT_YOUR_THREAD);
        }
    }

    private SupportThread load(String threadId) {
        return threads.findById(parseId(threadId))
                .orElseThrow(() -> new DomainException.NotFound(SupportError.THREAD_NOT_FOUND));
    }

    private byte[] parseId(String threadId) {
        try {
            return UuidUtil.toBytes(threadId);
        } catch (RuntimeException e) {
            throw new DomainException.NotFound(SupportError.THREAD_NOT_FOUND);
        }
    }

    private Product product(String productId) {
        byte[] id;
        try {
            id = UuidUtil.toBytes(productId);
        } catch (RuntimeException e) {
            throw new DomainException.NotFound(SupportError.PRODUCT_NOT_FOUND);
        }
        return productRepository.findById(id)
                .filter(p -> !p.isArchived())
                .orElseThrow(() -> new DomainException.NotFound(SupportError.PRODUCT_NOT_FOUND));
    }

    private String customerName(long userId) {
        return userRepository.findById(userId).map(SupportMapper::displayName).orElse(null);
    }

    private static String firstImage(Product p) {
        if (p.getImages() == null || p.getImages().isEmpty()) {
            return null;
        }
        return p.getImages().stream()
                .min(Comparator.comparingInt(ProductImage::getSortOrder)
                        .thenComparing(i -> i.getId() == null ? Long.MAX_VALUE : i.getId()))
                .map(ProductImage::getUrl)
                .orElse(null);
    }

    private MessageType parseType(String type) {
        if (type == null || type.isBlank()) {
            return MessageType.TEXT;
        }
        try {
            MessageType t = MessageType.valueOf(type.trim().toUpperCase(Locale.ROOT));
            // SYSTEM cards are the server's own; nobody posts them through the API.
            return t == MessageType.SYSTEM ? MessageType.TEXT : t;
        } catch (IllegalArgumentException e) {
            throw new DomainException.BadRequest(SupportError.UNKNOWN_MESSAGE_TYPE, type);
        }
    }
}
