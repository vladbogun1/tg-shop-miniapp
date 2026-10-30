package com.maxsolch.shop.support.app;

import com.maxsolch.shop.domain.User;
import com.maxsolch.shop.media.app.MediaSigner;
import com.maxsolch.shop.platform.i18n.ChatPreview;
import com.maxsolch.shop.platform.i18n.Messages;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.support.app.SupportDtos.MessageDto;
import com.maxsolch.shop.support.app.SupportDtos.ThreadDto;
import com.maxsolch.shop.support.domain.SupportMessage;
import com.maxsolch.shop.support.domain.SupportThread;
import org.springframework.stereotype.Component;

import static com.maxsolch.shop.platform.util.Texts.ellipsize;

/** Support rows to what the apps get: thread and message DTOs, previews, a customer's display name. */
@Component
public class SupportMapper {

    private final MediaSigner mediaSigner;
    private final Messages messages;

    public SupportMapper(MediaSigner mediaSigner, Messages messages) {
        this.mediaSigner = mediaSigner;
        this.messages = messages;
    }

    public ThreadDto toDto(SupportThread t, boolean admin) {
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

    public MessageDto toDto(SupportMessage m) {
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

    static String displayName(User u) {
        String full = ((u.getFirstName() == null ? "" : u.getFirstName().trim()) + " "
                + (u.getLastName() == null ? "" : u.getLastName().trim())).trim();
        if (!full.isEmpty()) {
            return ellipsize(full, 255);
        }
        return u.getUsername() == null || u.getUsername().isBlank() ? null : "@" + u.getUsername().trim();
    }
}
