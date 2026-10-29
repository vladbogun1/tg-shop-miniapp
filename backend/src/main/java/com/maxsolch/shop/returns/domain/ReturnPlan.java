package com.maxsolch.shop.returns.domain;

import java.util.List;

/**
 * The whole return in one go.
 *
 * @param retainMinor     money the shop keeps on purpose (the prepayment that paid for delivery)
 * @param monoRefundMinor what the caller will send back through monobank after this commits;
 *                        only validated here (booked when the bank confirms, never twice)
 */
public record ReturnPlan(List<WizardLine> lines, List<ManualRefund> refunds, long retainMinor,
                         long monoRefundMinor, String note, boolean notifyCustomer) {

    /** The lines that really move units (quantity above zero). */
    public List<WizardLine> activeLines() {
        return lines == null ? List.of() : lines.stream().filter(l -> l.quantity() > 0).toList();
    }

    /** The manual refunds with a non-zero amount. */
    public List<ManualRefund> activeRefunds() {
        return refunds == null ? List.of() : refunds.stream().filter(r -> r.amountMinor() != 0).toList();
    }

    /** The note without surrounding blanks; null when blank. */
    public String cleanNote() {
        return note == null || note.isBlank() ? null : note.trim();
    }
}
