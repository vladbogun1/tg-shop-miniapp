package com.maxsolch.shop.payment;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface PaymentInvoiceRepository extends JpaRepository<PaymentInvoice, byte[]> {

    /** Newest first. */
    List<PaymentInvoice> findByOrderIdOrderByCreatedAtDesc(byte[] orderId);

    List<PaymentInvoice> findByOrderIdInOrderByCreatedAtDesc(Collection<byte[]> orderIds);

    Optional<PaymentInvoice> findByProviderAndExternalId(String provider, String externalId);

    /** Webhooks and status polls for one invoice run one after another. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select i from PaymentInvoice i where i.provider = :provider and i.externalId = :externalId")
    Optional<PaymentInvoice> findForUpdate(@Param("provider") String provider,
                                           @Param("externalId") String externalId);

    /** Invoices whose status may still change, created before {@code before}. */
    @Query("select i from PaymentInvoice i where i.status in :statuses and i.createdAt < :before")
    List<PaymentInvoice> findOpenCreatedBefore(@Param("statuses") Collection<String> statuses,
                                               @Param("before") Instant before);

    List<PaymentInvoice> findByRefundPendingUntilAfter(Instant now);
}
