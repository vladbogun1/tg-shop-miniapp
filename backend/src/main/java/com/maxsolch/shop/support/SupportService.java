package com.maxsolch.shop.support;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.MessageType;
import com.maxsolch.shop.domain.Product;
import com.maxsolch.shop.domain.ProductImage;
import com.maxsolch.shop.domain.SenderType;
import com.maxsolch.shop.domain.User;
import com.maxsolch.shop.i18n.ChatPreview;
import com.maxsolch.shop.i18n.Messages;
import com.maxsolch.shop.media.ImageStorageService;
import com.maxsolch.shop.media.MediaSigner;
import com.maxsolch.shop.repository.ProductRepository;
import com.maxsolch.shop.repository.UserRepository;
import com.maxsolch.shop.settings.SettingsRegistry;
import com.maxsolch.shop.settings.SettingsService;
import com.maxsolch.shop.support.SupportDtos.ConfigDto;
import com.maxsolch.shop.support.SupportDtos.CreateThreadRequest;
import com.maxsolch.shop.support.SupportDtos.MessageDto;
import com.maxsolch.shop.support.SupportDtos.ThreadDto;
import com.maxsolch.shop.web.BadRequestException;
import com.maxsolch.shop.web.ForbiddenException;
import com.maxsolch.shop.web.NotFoundException;
import com.maxsolch.shop.web.dto.SendMessageRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.PageRequest;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

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
    private final ProductRepository productRepository;
    private final UserRepository userRepository;
    private final SettingsService settings;
    private final SimpMessagingTemplate messagingTemplate;
    private final ApplicationEventPublisher events;
    private final MediaSigner mediaSigner;
    private final Messages messages;
    private final Clock clock;

    @Autowired
    public SupportService(SupportThreadRepository threads,
                          SupportMessageRepository messageRepository,
                          ProductRepository productRepository,
                          UserRepository userRepository,
                          SettingsService settings,
                          SimpMessagingTemplate messagingTemplate,
                          ApplicationEventPublisher events,
                          MediaSigner mediaSigner,
                          Messages messages) {
        this(threads, messageRepository, productRepository, userRepository, settings, messagingTemplate,
                events, mediaSigner, messages, Clock.systemUTC());
    }

    SupportService(SupportThreadRepository threads,
                   SupportMessageRepository messageRepository,
                   ProductRepository productRepository,
                   UserRepository userRepository,
                   SettingsService settings,
                   SimpMessagingTemplate messagingTemplate,
                   ApplicationEventPublisher events,
                   MediaSigner mediaSigner,
                   Messages messages,
                   Clock clock) {
        this.threads = threads;
        this.messageRepository = messageRepository;
        this.productRepository = productRepository;
        this.userRepository = userRepository;
        this.settings = settings;
        this.messagingTemplate = messagingTemplate;
        this.events = events;
        this.mediaSigner = mediaSigner;
        this.messages = messages;
        this.clock = clock;
    }

    // ------------------------------------------------------------------ config

    public ConfigDto config() {
        return new ConfigDto(
                settings.getBool(SettingsRegistry.SUPPORT_ENABLED),
                settings.getInt(SettingsRegistry.SUPPORT_MAX_LENGTH),
                settings.getInt(SettingsRegistry.SUPPORT_COOLDOWN_SEC),
                settings.getInt(SettingsRegistry.SUPPORT_MAX_OPEN_THREADS),
                settings.getInt(SettingsRegistry.SUPPORT_MAX_MESSAGES_PER_HOUR));
    }

    // ------------------------------------------------------------------ customer

    @Transactional(readOnly = true)
    public List<ThreadDto> listMine(long userId) {
        return threads.findTop100ByUserIdOrderByLastMessageAtDesc(userId).stream()
                .map(t -> toDto(t, false))
                .toList();
    }

    @Transactional(readOnly = true)
    public ThreadDto getMine(long userId, String threadId) {
        return toDto(owned(userId, threadId), false);
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
            throw new BadRequestException(messages.current("api.chat.needsContent"));
        }
        SendMessageRequest first = new SendMessageRequest(req.text(), req.type(), req.attachmentUrl(),
                req.fileName(), req.mimeType(), null);
        Instant now = clock.instant();
        requireEnabled();
        validateContent(userId, first);
        checkRate(userId, now);

        Product product = null;
        if (req.productId() != null && !req.productId().isBlank()) {
            product = product(req.productId());
            Optional<SupportThread> existing = threads.findOpenForProduct(userId, product.getId());
            if (existing.isPresent()) {
                SupportThread t = threads.findForUpdate(existing.get().getId()).orElse(existing.get());
                postCustomer(t, userId, first, now, false);
                return toDto(t, false);
            }
        }
        requireThreadSlot(userId);

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
            t.setProductTitle(cut(product.getTitle(), 255));
            t.setProductSlug(cut(product.getSlug(), 255));
            t.setProductImageUrl(firstImage(product));
            t.setSubject(cut(product.getTitle(), SUBJECT_MAX));
        } else {
            String subject = req.subject() == null ? null : req.subject().strip();
            t.setSubject(subject == null || subject.isEmpty() ? null : cut(subject, SUBJECT_MAX));
        }
        threads.saveAndFlush(t);
        postCustomer(t, userId, first, now, true);
        return toDto(t, false);
    }

    /** A customer message in their own thread; writing into a closed thread reopens it. */
    @Transactional
    public MessageDto sendAsCustomer(long userId, String threadId, SendMessageRequest req) {
        Instant now = clock.instant();
        requireEnabled();
        validateContent(userId, req);
        SupportThread t = ownedForUpdate(userId, threadId);
        checkRate(userId, now);
        if (t.getStatus() == SupportStatus.CLOSED) {
            requireThreadSlot(userId);
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
        return toDto(t, false);
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
                .map(t -> toDto(t, true))
                .toList();
    }

    @Transactional(readOnly = true)
    public ThreadDto adminGet(String threadId) {
        return toDto(load(threadId), true);
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
        requireContent(req);
        // Answering means the customer's messages have been read.
        messageRepository.markRead(id, SenderType.CUSTOMER, now);
        SupportThread t = threads.findForUpdate(id)
                .orElseThrow(() -> new NotFoundException(messages.current("api.support.notFound")));
        SupportMessage m = persist(t.getId(), SenderType.ADMIN, adminId, adminName, req, now);
        if (t.getStatus() == SupportStatus.CLOSED) {
            reopen(t);
        }
        t.setLastMessageAt(now);
        t.setLastSender(SenderType.ADMIN);
        t.setLastPreview(cut(previewOf(m), PREVIEW_MAX));
        t.setCustomerUnread(t.getCustomerUnread() + 1);
        t.setAdminUnread(0);
        t.setAwaitingSince(null);
        threads.save(t);
        MessageDto dto = toDto(m);
        afterCommit(t.getId(), dto);
        events.publishEvent(new SupportEvents.MessagePosted(t.getId(), true, false, previewOf(m)));
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
        return toDto(t, true);
    }

    @Transactional
    public ThreadDto adminReopen(String threadId) {
        SupportThread t = threads.findForUpdate(load(threadId).getId()).orElseThrow();
        if (t.getStatus() == SupportStatus.CLOSED) {
            reopen(t);
            threads.save(t);
        }
        return toDto(t, true);
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

    // ------------------------------------------------------------------ limits

    private void requireEnabled() {
        if (!settings.getBool(SettingsRegistry.SUPPORT_ENABLED)) {
            throw new BadRequestException(messages.current("api.support.disabled"), "SUPPORT_DISABLED");
        }
    }

    /** Text or attachment present, text within {@code support.maxLength}, attachment is the customer's own. */
    private void validateContent(long userId, SendMessageRequest req) {
        requireContent(req);
        int max = settings.getInt(SettingsRegistry.SUPPORT_MAX_LENGTH);
        if (max > 0 && req.text() != null && req.text().strip().length() > max) {
            throw new BadRequestException(messages.current("api.support.tooLong", max), "SUPPORT_TOO_LONG");
        }
        if (req.attachmentUrl() != null && !req.attachmentUrl().isBlank()
                && !ImageStorageService.isCustomerAttachmentKey(req.attachmentUrl(), userId)) {
            throw new BadRequestException(messages.current("api.chat.badAttachment"));
        }
    }

    private void requireContent(SendMessageRequest req) {
        if (req == null || ((req.text() == null || req.text().isBlank())
                && (req.attachmentUrl() == null || req.attachmentUrl().isBlank()))) {
            throw new BadRequestException(messages.current("api.chat.needsContent"));
        }
    }

    /** {@code support.cooldownSec} between messages and {@code support.maxMessagesPerHour}. */
    private void checkRate(long userId, Instant now) {
        int cooldown = settings.getInt(SettingsRegistry.SUPPORT_COOLDOWN_SEC);
        if (cooldown > 0) {
            Instant last = messageRepository.lastSentAt(SenderType.CUSTOMER, userId);
            if (last != null) {
                long wait = cooldown - Duration.between(last, now).getSeconds();
                if (wait > 0) {
                    throw new BadRequestException(messages.current("api.support.cooldown", wait), "SUPPORT_COOLDOWN");
                }
            }
        }
        int perHour = settings.getInt(SettingsRegistry.SUPPORT_MAX_MESSAGES_PER_HOUR);
        if (perHour > 0) {
            long sent = messageRepository.countSentSince(SenderType.CUSTOMER, userId, now.minus(Duration.ofHours(1)));
            if (sent >= perHour) {
                throw new BadRequestException(messages.current("api.support.hourlyLimit", perHour),
                        "SUPPORT_HOURLY_LIMIT");
            }
        }
    }

    /** {@code support.maxOpenThreads}: room for one more open thread. */
    private void requireThreadSlot(long userId) {
        int max = settings.getInt(SettingsRegistry.SUPPORT_MAX_OPEN_THREADS);
        if (max > 0 && threads.countByUserIdAndStatus(userId, SupportStatus.OPEN) >= max) {
            throw new BadRequestException(messages.current("api.support.tooManyThreads", max),
                    "SUPPORT_TOO_MANY_THREADS");
        }
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
        t.setLastPreview(cut(previewOf(m), PREVIEW_MAX));
        t.setAdminUnread(t.getAdminUnread() + 1);
        if (t.getAwaitingSince() == null) {
            t.setAwaitingSince(now);
        }
        threads.save(t);
        MessageDto dto = toDto(m);
        afterCommit(t.getId(), dto);
        events.publishEvent(new SupportEvents.MessagePosted(t.getId(), false, newThread, previewOf(m)));
        return dto;
    }

    private SupportMessage persist(byte[] threadId, SenderType sender, Long senderId, String senderName,
                                   SendMessageRequest req, Instant now) {
        SupportMessage m = new SupportMessage();
        m.setThreadId(threadId);
        m.setSenderType(sender);
        m.setSenderId(senderId);
        m.setSenderName(senderName == null ? null : cut(senderName, 255));
        boolean hasAttachment = req.attachmentUrl() != null && !req.attachmentUrl().isBlank();
        MessageType type = parseType(req.type());
        if (type == MessageType.TEXT && hasAttachment) {
            type = req.mimeType() != null && !req.mimeType().startsWith("image/") ? MessageType.FILE : MessageType.PHOTO;
        }
        m.setType(type);
        String text = req.text() == null ? null : req.text().strip();
        m.setText(text == null || text.isEmpty() ? null : cut(text, 8192));
        m.setAttachmentUrl(hasAttachment ? req.attachmentUrl().trim() : null);
        m.setFileName(req.fileName() == null ? null : cut(req.fileName(), 512));
        m.setMimeType(req.mimeType() == null ? null : cut(req.mimeType(), 128));
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
            out.add(toDto(page.get(i)));
        }
        return out;
    }

    private void afterCommit(byte[] threadId, MessageDto dto) {
        String destination = "/topic/support/" + UuidUtil.toString(threadId);
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    messagingTemplate.convertAndSend(destination, dto);
                }
            });
        } else {
            messagingTemplate.convertAndSend(destination, dto);
        }
    }

    private SupportThread owned(long userId, String threadId) {
        SupportThread t = load(threadId);
        requireOwner(t, userId);
        return t;
    }

    private SupportThread ownedForUpdate(long userId, String threadId) {
        SupportThread t = threads.findForUpdate(parseId(threadId))
                .orElseThrow(() -> new NotFoundException(messages.current("api.support.notFound")));
        requireOwner(t, userId);
        return t;
    }

    private void requireOwner(SupportThread t, long userId) {
        if (t.getUserId() == null || t.getUserId() != userId) {
            throw new ForbiddenException(messages.current("api.support.notYours"));
        }
    }

    private SupportThread load(String threadId) {
        return threads.findById(parseId(threadId))
                .orElseThrow(() -> new NotFoundException(messages.current("api.support.notFound")));
    }

    private byte[] parseId(String threadId) {
        try {
            return UuidUtil.toBytes(threadId);
        } catch (RuntimeException e) {
            throw new NotFoundException(messages.current("api.support.notFound"));
        }
    }

    private Product product(String productId) {
        byte[] id;
        try {
            id = UuidUtil.toBytes(productId);
        } catch (RuntimeException e) {
            throw new NotFoundException(messages.current("api.support.productNotFound"));
        }
        return productRepository.findById(id)
                .filter(p -> !p.isArchived())
                .orElseThrow(() -> new NotFoundException(messages.current("api.support.productNotFound")));
    }

    private String customerName(long userId) {
        return userRepository.findById(userId).map(SupportService::displayName).orElse(null);
    }

    static String displayName(User u) {
        String full = ((u.getFirstName() == null ? "" : u.getFirstName().trim()) + " "
                + (u.getLastName() == null ? "" : u.getLastName().trim())).trim();
        if (!full.isEmpty()) {
            return cut(full, 255);
        }
        return u.getUsername() == null || u.getUsername().isBlank() ? null : "@" + u.getUsername().trim();
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
            throw new BadRequestException(messages.current("api.chat.unknownType", type));
        }
    }

    /** Short preview for lists and notifications. */
    static String previewOf(SupportMessage m) {
        if (m.getText() != null && !m.getText().isBlank()) {
            return m.getText().replaceAll("\\s+", " ").trim();
        }
        return switch (m.getType()) {
            case PHOTO -> ChatPreview.PHOTO;
            case FILE -> m.getFileName() == null ? ChatPreview.FILE : "📎 " + m.getFileName();
            default -> "";
        };
    }

    private static String cut(String s, int max) {
        if (s == null) {
            return null;
        }
        return s.length() <= max ? s : s.substring(0, max - 1) + "…";
    }

    ThreadDto toDto(SupportThread t, boolean admin) {
        return new ThreadDto(
                UuidUtil.toString(t.getId()),
                t.getStatus().name(),
                t.getSubject(),
                t.getProductId() == null ? null : UuidUtil.toString(t.getProductId()),
                t.getProductTitle(),
                t.getProductSlug(),
                t.getProductImageUrl(),
                t.getSource(),
                t.getLastMessageAt(),
                t.getLastSender() == null ? null : t.getLastSender().name(),
                admin ? t.getLastPreview() : ChatPreview.current(t.getLastPreview(), messages),
                admin ? t.getAdminUnread() : t.getCustomerUnread(),
                t.getAwaitingSince(),
                t.getCreatedAt(),
                t.getClosedAt(),
                t.getClosedBy(),
                t.getUserId(),
                t.getCustomerName());
    }

    private MessageDto toDto(SupportMessage m) {
        return new MessageDto(
                m.getId(),
                UuidUtil.toString(m.getThreadId()),
                m.getSenderType().name(),
                m.getSenderName(),
                m.getType().name(),
                m.getText(),
                // Private bucket: the client gets a short-lived signed link, never the raw key.
                mediaSigner.signedUrl(m.getAttachmentUrl()),
                m.getFileName(),
                m.getMimeType(),
                m.getReplyToMessageId(),
                m.getCreatedAt(),
                m.getReadAt());
    }
}
