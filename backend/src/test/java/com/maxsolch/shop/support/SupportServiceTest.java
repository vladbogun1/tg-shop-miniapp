package com.maxsolch.shop.support;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.Product;
import com.maxsolch.shop.domain.SenderType;
import com.maxsolch.shop.i18n.Messages;
import com.maxsolch.shop.inbox.InboxDtos.Item;
import com.maxsolch.shop.media.ImageStorageService;
import com.maxsolch.shop.media.MediaSigner;
import com.maxsolch.shop.repository.ProductRepository;
import com.maxsolch.shop.repository.UserRepository;
import com.maxsolch.shop.settings.SettingsRegistry;
import com.maxsolch.shop.settings.SettingsService;
import com.maxsolch.shop.support.SupportDtos.CreateThreadRequest;
import com.maxsolch.shop.support.SupportDtos.ThreadDto;
import com.maxsolch.shop.web.BadRequestException;
import com.maxsolch.shop.web.ForbiddenException;
import com.maxsolch.shop.web.NotFoundException;
import com.maxsolch.shop.web.dto.SendMessageRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class SupportServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-05T12:00:00Z");
    private static final long USER = 42L;

    @Mock
    SupportThreadRepository threads;
    @Mock
    SupportMessageRepository messageRepository;
    @Mock
    ProductRepository productRepository;
    @Mock
    UserRepository userRepository;
    @Mock
    SettingsService settings;
    @Mock
    SimpMessagingTemplate messagingTemplate;
    @Mock
    ApplicationEventPublisher events;
    @Mock
    MediaSigner mediaSigner;
    @Mock
    Messages messages;

    SupportService service;
    final AtomicLong ids = new AtomicLong();

    @BeforeEach
    void setUp() {
        service = new SupportService(threads, messageRepository, productRepository, userRepository, settings,
                messagingTemplate, events, mediaSigner, messages, Clock.fixed(NOW, ZoneOffset.UTC));
        when(settings.getBool(SettingsRegistry.SUPPORT_ENABLED)).thenReturn(true);
        when(settings.getInt(SettingsRegistry.SUPPORT_COOLDOWN_SEC)).thenReturn(10);
        when(settings.getInt(SettingsRegistry.SUPPORT_MAX_MESSAGES_PER_HOUR)).thenReturn(30);
        when(settings.getInt(SettingsRegistry.SUPPORT_MAX_OPEN_THREADS)).thenReturn(3);
        when(settings.getInt(SettingsRegistry.SUPPORT_MAX_LENGTH)).thenReturn(2000);
        when(settings.getInt(SettingsRegistry.SUPPORT_AUTO_CLOSE_DAYS)).thenReturn(7);
        when(userRepository.findById(anyLong())).thenReturn(Optional.empty());
        when(threads.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));
        when(threads.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(messageRepository.saveAndFlush(any())).thenAnswer(inv -> {
            SupportMessage m = inv.getArgument(0);
            m.setId(ids.incrementAndGet());
            return m;
        });
    }

    private static SupportThread thread(long owner, SupportStatus status) {
        SupportThread t = new SupportThread();
        t.setId(UuidUtil.randomBytes());
        t.setUserId(owner);
        t.setTgUserId(owner);
        t.setStatus(status);
        t.setCreatedAt(NOW.minus(Duration.ofDays(1)));
        t.setLastMessageAt(NOW.minus(Duration.ofDays(1)));
        return t;
    }

    private void stubThread(SupportThread t) {
        when(threads.findById(any())).thenReturn(Optional.of(t));
        when(threads.findForUpdate(any())).thenReturn(Optional.of(t));
    }

    private static SendMessageRequest text(String s) {
        return new SendMessageRequest(s, "TEXT", null, null, null, null);
    }

    private static CreateThreadRequest ask(String productId, String s) {
        return new CreateThreadRequest(productId, null, s, "TEXT", null, null, null);
    }

    private static String code(Throwable e) {
        return ((BadRequestException) e).getCode();
    }

    // ------------------------------------------------------------------ limits

    @Test
    void disabled_rejectsNewQuestionsAndMessages_butAdminCanStillAnswer() {
        when(settings.getBool(SettingsRegistry.SUPPORT_ENABLED)).thenReturn(false);
        SupportThread t = thread(USER, SupportStatus.OPEN);
        stubThread(t);

        assertThatThrownBy(() -> service.create(USER, "MINIAPP", ask(null, "Привіт")))
                .isInstanceOf(BadRequestException.class)
                .satisfies(e -> assertThat(code(e)).isEqualTo("SUPPORT_DISABLED"));
        assertThatThrownBy(() -> service.sendAsCustomer(USER, UuidUtil.toString(t.getId()), text("ще")))
                .satisfies(e -> assertThat(code(e)).isEqualTo("SUPPORT_DISABLED"));

        service.sendAsAdmin(UuidUtil.toString(t.getId()), 1L, "Адмін", text("Відповідь"));
        assertThat(t.getLastSender()).isEqualTo(SenderType.ADMIN);
    }

    @Test
    void tooLong_isRejected() {
        when(settings.getInt(SettingsRegistry.SUPPORT_MAX_LENGTH)).thenReturn(100);
        assertThatThrownBy(() -> service.create(USER, "WEB", ask(null, "x".repeat(101))))
                .satisfies(e -> assertThat(code(e)).isEqualTo("SUPPORT_TOO_LONG"));
        // Exactly the limit is fine.
        ThreadDto ok = service.create(USER, "WEB", ask(null, "x".repeat(100)));
        assertThat(ok.status()).isEqualTo("OPEN");
    }

    @Test
    void emptyMessage_isRejected() {
        assertThatThrownBy(() -> service.create(USER, "WEB", ask(null, "   ")))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void cooldown_blocksAQuickSecondMessage() {
        SupportThread t = thread(USER, SupportStatus.OPEN);
        stubThread(t);
        when(messageRepository.lastSentAt(SenderType.CUSTOMER, USER)).thenReturn(NOW.minusSeconds(4));
        assertThatThrownBy(() -> service.sendAsCustomer(USER, UuidUtil.toString(t.getId()), text("ще")))
                .satisfies(e -> assertThat(code(e)).isEqualTo("SUPPORT_COOLDOWN"));
        verify(messages).current("api.support.cooldown", 6L);

        when(messageRepository.lastSentAt(SenderType.CUSTOMER, USER)).thenReturn(NOW.minusSeconds(10));
        service.sendAsCustomer(USER, UuidUtil.toString(t.getId()), text("ще"));
        assertThat(t.getAdminUnread()).isEqualTo(1);
    }

    @Test
    void cooldownZero_meansNoPause() {
        when(settings.getInt(SettingsRegistry.SUPPORT_COOLDOWN_SEC)).thenReturn(0);
        SupportThread t = thread(USER, SupportStatus.OPEN);
        stubThread(t);
        when(messageRepository.lastSentAt(SenderType.CUSTOMER, USER)).thenReturn(NOW);
        service.sendAsCustomer(USER, UuidUtil.toString(t.getId()), text("ще"));
        verify(messageRepository, never()).lastSentAt(any(), anyLong());
    }

    @Test
    void hourlyLimit_countsTheLastHourAcrossThreads() {
        when(messageRepository.countSentSince(eq(SenderType.CUSTOMER), eq(USER), eq(NOW.minus(Duration.ofHours(1)))))
                .thenReturn(30L);
        assertThatThrownBy(() -> service.create(USER, "MINIAPP", ask(null, "Питання")))
                .satisfies(e -> assertThat(code(e)).isEqualTo("SUPPORT_HOURLY_LIMIT"));

        when(messageRepository.countSentSince(eq(SenderType.CUSTOMER), eq(USER), any())).thenReturn(29L);
        assertThat(service.create(USER, "MINIAPP", ask(null, "Питання")).status()).isEqualTo("OPEN");
    }

    @Test
    void openThreadsLimit_blocksANewThread() {
        when(threads.countByUserIdAndStatus(USER, SupportStatus.OPEN)).thenReturn(3L);
        assertThatThrownBy(() -> service.create(USER, "MINIAPP", ask(null, "Ще одне питання")))
                .satisfies(e -> assertThat(code(e)).isEqualTo("SUPPORT_TOO_MANY_THREADS"));
        verify(threads, never()).saveAndFlush(any());
    }

    @Test
    void questionAboutTheSameProduct_goesIntoTheOpenThread_evenAtTheLimit() {
        Product p = new Product();
        p.setId(UuidUtil.randomBytes());
        p.setTitle("Cooler");
        p.setSlug("cooler");
        when(productRepository.findById(any())).thenReturn(Optional.of(p));
        SupportThread existing = thread(USER, SupportStatus.OPEN);
        existing.setProductId(p.getId());
        when(threads.findOpenForProduct(eq(USER), any(byte[].class))).thenReturn(Optional.of(existing));
        when(threads.findForUpdate(any())).thenReturn(Optional.of(existing));
        when(threads.countByUserIdAndStatus(USER, SupportStatus.OPEN)).thenReturn(3L);

        ThreadDto dto = service.create(USER, "MINIAPP", ask(UuidUtil.toString(p.getId()), "Є в наявності?"));

        assertThat(dto.id()).isEqualTo(UuidUtil.toString(existing.getId()));
        assertThat(existing.getAdminUnread()).isEqualTo(1);
        verify(threads, never()).saveAndFlush(any());
    }

    @Test
    void create_snapshotsTheProduct_andNotifiesAdmins() {
        Product p = new Product();
        p.setId(UuidUtil.randomBytes());
        p.setTitle("Thermal paste");
        p.setSlug("thermal-paste");
        when(productRepository.findById(any())).thenReturn(Optional.of(p));
        when(threads.findOpenForProduct(eq(USER), any(byte[].class))).thenReturn(Optional.empty());

        ThreadDto dto = service.create(USER, "WEB", ask(UuidUtil.toString(p.getId()), "Скільки грамів?"));

        assertThat(dto.productTitle()).isEqualTo("Thermal paste");
        assertThat(dto.productSlug()).isEqualTo("thermal-paste");
        assertThat(dto.source()).isEqualTo("WEB");
        assertThat(dto.awaitingSince()).isEqualTo(NOW);
        assertThat(dto.lastPreview()).isEqualTo("Скільки грамів?");
        ArgumentCaptor<Object> event = ArgumentCaptor.forClass(Object.class);
        verify(events).publishEvent(event.capture());
        SupportEvents.MessagePosted posted = (SupportEvents.MessagePosted) event.getValue();
        assertThat(posted.fromAdmin()).isFalse();
        assertThat(posted.newThread()).isTrue();
        verify(messagingTemplate).convertAndSend(eq("/topic/support/" + dto.id()), any(Object.class));
    }

    @Test
    void archivedProduct_isNotFound() {
        Product p = new Product();
        p.setId(UuidUtil.randomBytes());
        p.setArchived(true);
        when(productRepository.findById(any())).thenReturn(Optional.of(p));
        assertThatThrownBy(() -> service.create(USER, "WEB", ask(UuidUtil.toString(p.getId()), "?")))
                .isInstanceOf(NotFoundException.class);
    }

    @Test
    void foreignAttachment_isRejected() {
        String foreign = ImageStorageService.customerChatPrefix(7L) + "x.png";
        CreateThreadRequest req = new CreateThreadRequest(null, null, null, "PHOTO", foreign, "x.png", "image/png");
        assertThatThrownBy(() -> service.create(USER, "WEB", req)).isInstanceOf(BadRequestException.class);

        String own = ImageStorageService.customerChatPrefix(USER) + "x.png";
        // The stored preview is the seller's Russian placeholder; the customer reads it in their language.
        when(messages.get(any(java.util.Locale.class), eq("api.chat.photo"))).thenReturn("📷 Photo");
        ThreadDto ok = service.create(USER, "WEB",
                new CreateThreadRequest(null, null, null, "PHOTO", own, "x.png", "image/png"));
        assertThat(ok.lastPreview()).isEqualTo("📷 Photo");
    }

    @Test
    void closedThread_reopensOnCustomerMessage_onlyIfThereIsRoom() {
        SupportThread t = thread(USER, SupportStatus.CLOSED);
        stubThread(t);
        when(threads.countByUserIdAndStatus(USER, SupportStatus.OPEN)).thenReturn(3L);
        assertThatThrownBy(() -> service.sendAsCustomer(USER, UuidUtil.toString(t.getId()), text("ще")))
                .satisfies(e -> assertThat(code(e)).isEqualTo("SUPPORT_TOO_MANY_THREADS"));

        when(threads.countByUserIdAndStatus(USER, SupportStatus.OPEN)).thenReturn(1L);
        service.sendAsCustomer(USER, UuidUtil.toString(t.getId()), text("ще"));
        assertThat(t.getStatus()).isEqualTo(SupportStatus.OPEN);
        assertThat(t.getClosedAt()).isNull();
    }

    // ------------------------------------------------------------------ ownership

    @Test
    void anotherCustomersThread_isForbidden() {
        SupportThread t = thread(7L, SupportStatus.OPEN);
        stubThread(t);
        String id = UuidUtil.toString(t.getId());
        assertThatThrownBy(() -> service.getMine(USER, id)).isInstanceOf(ForbiddenException.class);
        assertThatThrownBy(() -> service.messagesMine(USER, id, null, null)).isInstanceOf(ForbiddenException.class);
        assertThatThrownBy(() -> service.sendAsCustomer(USER, id, text("hi"))).isInstanceOf(ForbiddenException.class);
        assertThatThrownBy(() -> service.markReadByCustomer(USER, id)).isInstanceOf(ForbiddenException.class);
        assertThatThrownBy(() -> service.closeByCustomer(USER, id)).isInstanceOf(ForbiddenException.class);
        verify(messageRepository, never()).saveAndFlush(any());
    }

    @Test
    void isOwner_forStompSubscriptions() {
        SupportThread t = thread(USER, SupportStatus.OPEN);
        when(threads.findById(any())).thenReturn(Optional.of(t));
        assertThat(service.isOwner(UuidUtil.toString(t.getId()), USER)).isTrue();
        assertThat(service.isOwner(UuidUtil.toString(t.getId()), 7L)).isFalse();
        assertThat(service.isOwner("not-a-uuid", USER)).isFalse();
    }

    @Test
    void badId_isNotFound() {
        assertThatThrownBy(() -> service.getMine(USER, "nope")).isInstanceOf(NotFoundException.class);
    }

    // ------------------------------------------------------------------ admin

    @Test
    void adminAnswer_clearsWaiting_countsUnreadForCustomer_andReopens() {
        SupportThread t = thread(USER, SupportStatus.CLOSED);
        t.setAwaitingSince(NOW.minusSeconds(600));
        t.setAdminUnread(2);
        stubThread(t);

        service.sendAsAdmin(UuidUtil.toString(t.getId()), 1L, "Адмін", text("Так, є"));

        assertThat(t.getStatus()).isEqualTo(SupportStatus.OPEN);
        assertThat(t.getAwaitingSince()).isNull();
        assertThat(t.getAdminUnread()).isZero();
        assertThat(t.getCustomerUnread()).isEqualTo(1);
        verify(messageRepository).markRead(any(), eq(SenderType.CUSTOMER), eq(NOW));
        ArgumentCaptor<Object> event = ArgumentCaptor.forClass(Object.class);
        verify(events).publishEvent(event.capture());
        assertThat(((SupportEvents.MessagePosted) event.getValue()).fromAdmin()).isTrue();
    }

    @Test
    void adminClose_stopsWaiting() {
        SupportThread t = thread(USER, SupportStatus.OPEN);
        t.setAwaitingSince(NOW.minusSeconds(60));
        stubThread(t);
        ThreadDto dto = service.adminClose(UuidUtil.toString(t.getId()));
        assertThat(dto.status()).isEqualTo("CLOSED");
        assertThat(dto.closedBy()).isEqualTo("ADMIN");
        assertThat(t.getAwaitingSince()).isNull();
    }

    // ------------------------------------------------------------------ auto-close

    @Test
    void autoClose_closesInactiveThreads() {
        SupportThread a = thread(USER, SupportStatus.OPEN);
        SupportThread b = thread(7L, SupportStatus.OPEN);
        when(threads.findInactive(eq(NOW.minus(Duration.ofDays(7))), any())).thenReturn(List.of(a, b));

        assertThat(service.autoClose()).isEqualTo(2);
        assertThat(a.getStatus()).isEqualTo(SupportStatus.CLOSED);
        assertThat(a.getClosedBy()).isEqualTo("AUTO");
        assertThat(b.getClosedAt()).isEqualTo(NOW);
    }

    @Test
    void autoClose_zeroDaysMeansNever() {
        when(settings.getInt(SettingsRegistry.SUPPORT_AUTO_CLOSE_DAYS)).thenReturn(0);
        assertThat(service.autoClose()).isZero();
        verify(threads, never()).findInactive(any(), any());
    }

    // ------------------------------------------------------------------ «Внимание»

    @Test
    void inboxRow_showsCustomerProductAndWait() {
        SupportThread t = thread(USER, SupportStatus.OPEN);
        t.setCustomerName("Іван");
        t.setProductTitle("Cooler");
        t.setLastPreview("Є в наявності?");
        t.setAwaitingSince(NOW.minus(Duration.ofHours(3)));
        t.setAdminUnread(2);
        t.setLastMessageAt(NOW.minus(Duration.ofHours(1)));

        Item row = SupportInboxSource.row(t, NOW);

        assertThat(row.type()).isEqualTo("SUPPORT");
        assertThat(row.key()).isEqualTo("SUPPORT:" + UuidUtil.toString(t.getId()));
        assertThat(row.title()).isEqualTo("Іван");
        assertThat(row.subtitle()).isEqualTo("Cooler · Є в наявності?");
        assertThat(row.unread()).isEqualTo(2);
        assertThat(row.waitMinutes()).isEqualTo(180);
        assertThat(row.overdue()).isTrue();
        assertThat(row.version()).isEqualTo(String.valueOf(t.getLastMessageAt().toEpochMilli()));
    }
}
