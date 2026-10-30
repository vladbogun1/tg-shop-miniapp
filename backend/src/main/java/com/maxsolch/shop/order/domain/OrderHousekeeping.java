package com.maxsolch.shop.order.domain;

import java.time.Instant;

/**
 * The bookkeeping of an order that carries no money invariant: the return trail of a parcel, the customer's
 * cancellation request, the archive mark and the Telegram card ids. Each method writes the protected columns of
 * {@link OrderColumns}; {@link Order} adds the status machine, the lines and the money rules on top.
 */
public abstract class OrderHousekeeping extends OrderColumns {

    /** {@link #getReturnStatus()}: the refused parcel is on its way back / has arrived. */
    public static final String RETURN_IN_TRANSIT = "IN_TRANSIT";
    public static final String RETURN_RECEIVED = "RECEIVED";

    // ----- returns -----

    /** The latest return was registered. */
    public void markReturned(Instant now) {
        returnedAt = now;
    }

    /** No unit is returned any more: the timeline stops saying «Возврат оформлен». */
    public void clearReturned() {
        returnedAt = null;
    }

    /** Units were sent back: the parcel is on its way (a second batch does not restart the trip). */
    public void markUnitsSentBack(Instant now) {
        if (!RETURN_IN_TRANSIT.equals(returnStatus)) {
            returnStatus = RETURN_IN_TRANSIT;
            returnSentAt = now;
            returnReceivedAt = null;
        }
    }

    /** The returned parcel arrived at the shop. */
    public void markReturnReceived(Instant now) {
        returnStatus = RETURN_RECEIVED;
        returnReceivedAt = now;
    }

    /** A return was cancelled and nothing is on its way: another posted return keeps «received», else the trail goes. */
    public void settleReturnTrail(boolean otherReturnPosted) {
        returnStatus = otherReturnPosted ? RETURN_RECEIVED : null;
        if (!otherReturnPosted) {
            returnSentAt = null;
            returnReceivedAt = null;
        }
    }

    // ----- the customer's cancellation request -----

    public void requestCancel(String reason, Instant now) {
        cancelRequestStatus = CancelRequestStatus.PENDING.name();
        cancelRequestReason = reason;
        cancelRequestedAt = now;
        cancelRequestResolvedAt = null;
        cancelRequestAdminComment = null;
    }

    /** Approved; a blank comment is no comment. */
    public void approveCancelRequest(Instant now, String adminComment) {
        cancelRequestStatus = CancelRequestStatus.APPROVED.name();
        cancelRequestResolvedAt = now;
        cancelRequestAdminComment = adminComment == null || adminComment.isBlank() ? null : adminComment.trim();
    }

    /** The order was rejected by hand while a request was open: the request is fulfilled, the comment untouched. */
    public void fulfilCancelRequest(Instant now) {
        cancelRequestStatus = CancelRequestStatus.APPROVED.name();
        cancelRequestResolvedAt = now;
    }

    public void declineCancelRequest(Instant now, String adminComment) {
        cancelRequestStatus = CancelRequestStatus.DECLINED.name();
        cancelRequestResolvedAt = now;
        cancelRequestAdminComment = adminComment;
    }

    // ----- archive, Telegram cards -----

    /** Hidden from the board and the lists, kept with everything attached. */
    public void archive(Instant now, String by, String why) {
        archivedAt = now;
        archivedBy = by;
        archiveReason = why;
    }

    public void unarchive() {
        archivedAt = null;
        archivedBy = null;
        archiveReason = null;
    }

    /** Where the order card of the seller chat is: the chat, the topic (0 = none) and, once confirmed, the message. */
    public void rememberSellerCard(Long chatId, int threadId, Integer cardMessageId, boolean confirmed) {
        if (chatId != null) {
            notifyChatId = chatId;
        }
        notifyThreadId = threadId > 0 ? threadId : null;
        if (confirmed) {
            notifyMessageId = cardMessageId;
        }
    }

    public void forgetSellerCard() {
        notifyMessageId = null;
    }

    public void rememberDispatchCard(Integer cardMessageId) {
        dispatchMessageId = cardMessageId;
    }

    public void forgetDispatchCard() {
        dispatchMessageId = null;
    }
}
