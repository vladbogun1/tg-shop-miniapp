package com.maxsolch.shop.support.app;

import com.maxsolch.shop.support.domain.SupportError;

import com.maxsolch.shop.support.domain.SupportMessage;
import com.maxsolch.shop.support.domain.SupportStatus;
import com.maxsolch.shop.support.domain.SupportThread;
import com.maxsolch.shop.support.infra.SupportMessageRepository;
import com.maxsolch.shop.support.infra.SupportThreadRepository;

import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.catalog.domain.ProductImage;
import com.maxsolch.shop.order.domain.SenderType;
import com.maxsolch.shop.platform.i18n.Messages;
import com.maxsolch.shop.catalog.app.Products;
import com.maxsolch.shop.settings.app.SettingsService;
import com.maxsolch.shop.support.app.SupportDtos.ConfigDto;
import com.maxsolch.shop.support.app.SupportDtos.CreateThreadRequest;
import com.maxsolch.shop.support.app.SupportDtos.ThreadDto;
import com.maxsolch.shop.order.app.SendMessageRequest;
import com.maxsolch.shop.platform.error.DomainException;
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
    private static final int SUBJECT_MAX = 255;
    /** Auto-close works in batches so one run never loads the whole table. */
    private static final int AUTO_CLOSE_BATCH = 500;

    public static final String SOURCE_MINIAPP = "MINIAPP";
    public static final String SOURCE_WEB = "WEB";

    private final SupportThreadRepository threads;
    private final SupportMessageRepository messageRepository;
    private final Products productRepository;
    private final SettingsService settings;
    private final SupportLimits limits;
    private final SupportMapper mapper;
    private final Messages messages;
    private final Clock clock;
    private final SupportPosts posts;
    private final SupportThreadLookup lookup;

    public SupportService(SupportThreadRepository threads,
                          SupportMessageRepository messageRepository,
                          Products productRepository,
                          SettingsService settings,
                          SupportLimits limits,
                          SupportMapper mapper,
                          Messages messages,
                          Clock clock,
                          SupportPosts posts,
                          SupportThreadLookup lookup) {
        this.threads = threads;
        this.messageRepository = messageRepository;
        this.productRepository = productRepository;
        this.settings = settings;
        this.limits = limits;
        this.mapper = mapper;
        this.messages = messages;
        this.clock = clock;
        this.posts = posts;
        this.lookup = lookup;
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
        return mapper.toDto(lookup.owned(userId, threadId), false);
    }

    @Transactional(readOnly = true)
    public List<MessageDto> messagesMine(long userId, String threadId, Long before, Integer limit) {
        return page(lookup.owned(userId, threadId).getId(), before, limit);
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
                posts.postCustomer(t, userId, first, now, false);
                return mapper.toDto(t, false);
            }
        }
        limits.requireThreadSlot(userId);

        SupportThread t = new SupportThread();
        t.setId(UuidUtil.randomBytes());
        t.setUserId(userId);
        t.setTgUserId(userId > 0 ? userId : null);
        t.setCustomerName(posts.customerName(userId));
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
        posts.postCustomer(t, userId, first, now, true);
        return mapper.toDto(t, false);
    }

    /** A customer message in their own thread; writing into a closed thread reopens it. */
    @Transactional
    public MessageDto sendAsCustomer(long userId, String threadId, SendMessageRequest req) {
        Instant now = clock.instant();
        limits.requireEnabled();
        limits.validateContent(userId, req);
        SupportThread t = lookup.ownedForUpdate(userId, threadId);
        limits.checkRate(userId, now);
        if (t.getStatus() == SupportStatus.CLOSED) {
            limits.requireThreadSlot(userId);
        }
        return posts.postCustomer(t, userId, req, now, false);
    }

    @Transactional
    public void markReadByCustomer(long userId, String threadId) {
        byte[] id = lookup.owned(userId, threadId).getId();
        messageRepository.markRead(id, SenderType.ADMIN, clock.instant());
        threads.findById(id).ifPresent(t -> {
            t.setCustomerUnread(0);
            threads.save(t);
        });
    }

    @Transactional
    public ThreadDto closeByCustomer(long userId, String threadId) {
        SupportThread t = lookup.ownedForUpdate(userId, threadId);
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
        return mapper.toDto(lookup.load(threadId), true);
    }

    @Transactional(readOnly = true)
    public List<MessageDto> adminMessages(String threadId, Long before, Integer limit) {
        return page(lookup.load(threadId).getId(), before, limit);
    }

    /** Admin reply: the customer gets it live and as a bot DM; a closed thread reopens. */
    @Transactional
    public MessageDto sendAsAdmin(String threadId, Long adminId, String adminName, SendMessageRequest req) {
        byte[] id = lookup.load(threadId).getId();
        Instant now = clock.instant();
        limits.requireContent(req);
        // Answering means the customer's messages have been read.
        messageRepository.markRead(id, SenderType.CUSTOMER, now);
        SupportThread t = threads.findForUpdate(id)
                .orElseThrow(() -> new DomainException.NotFound(SupportError.THREAD_NOT_FOUND));
        return posts.postAdmin(t, adminId, adminName, req, now);
    }

    @Transactional
    public void markReadByAdmin(String threadId) {
        byte[] id = lookup.load(threadId).getId();
        messageRepository.markRead(id, SenderType.CUSTOMER, clock.instant());
        threads.findById(id).ifPresent(t -> {
            t.setAdminUnread(0);
            threads.save(t);
        });
    }

    /** Admin «Закрыть»: also stops the thread waiting on «Внимание». */
    @Transactional
    public ThreadDto adminClose(String threadId) {
        SupportThread t = threads.findForUpdate(lookup.load(threadId).getId()).orElseThrow();
        close(t, "ADMIN");
        return mapper.toDto(t, true);
    }

    @Transactional
    public ThreadDto adminReopen(String threadId) {
        SupportThread t = threads.findForUpdate(lookup.load(threadId).getId()).orElseThrow();
        if (t.getStatus() == SupportStatus.CLOSED) {
            SupportPosts.reopen(t);
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
        int days = settings.getInt(SupportSettings.SUPPORT_AUTO_CLOSE_DAYS);
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

    private List<MessageDto> page(byte[] threadId, Long before, Integer limit) {
        int size = Math.min(Math.max(1, limit == null ? DEFAULT_PAGE : limit), MAX_PAGE);
        List<SupportMessage> page = messageRepository.findPage(threadId, before, PageRequest.of(0, size));
        List<MessageDto> out = new ArrayList<>(page.size());
        for (int i = page.size() - 1; i >= 0; i--) {
            out.add(mapper.toDto(page.get(i)));
        }
        return out;
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
}
