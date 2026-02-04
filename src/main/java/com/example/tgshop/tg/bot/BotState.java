package com.example.tgshop.tg.bot;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

@Component
public class BotState {
    private final Map<Integer, PendingShipment> pendingShipments = new ConcurrentHashMap<>();
    private final Map<Integer, PendingRejection> pendingRejections = new ConcurrentHashMap<>();
    private final Map<ChatKey, ChatKey> adminToUserMap = new ConcurrentHashMap<>();
    private final Map<ChatKey, ChatKey> adminToUserHeaderMap = new ConcurrentHashMap<>();
    private final Map<ChatKey, ChatKey> userToAdminMap = new ConcurrentHashMap<>();
    private final Map<ChatKey, UUID> replyAnchorMap = new ConcurrentHashMap<>();
    private final Map<ChatKey, UUID> userMessageOrderMap = new ConcurrentHashMap<>();

    public Map<Integer, PendingShipment> pendingShipments() {
        return pendingShipments;
    }

    public Map<Integer, PendingRejection> pendingRejections() {
        return pendingRejections;
    }

    public Map<ChatKey, ChatKey> adminToUserMap() {
        return adminToUserMap;
    }

    public Map<ChatKey, ChatKey> adminToUserHeaderMap() {
        return adminToUserHeaderMap;
    }

    public Map<ChatKey, ChatKey> userToAdminMap() {
        return userToAdminMap;
    }

    public Map<ChatKey, UUID> replyAnchorMap() {
        return replyAnchorMap;
    }

    public Map<ChatKey, UUID> userMessageOrderMap() {
        return userMessageOrderMap;
    }

    public record PendingShipment(UUID orderId, long chatId, int orderMessageId) {}

    public record PendingRejection(UUID orderId, long chatId, int orderMessageId) {}

    public record ChatKey(long chatId, int messageId) {}
}
