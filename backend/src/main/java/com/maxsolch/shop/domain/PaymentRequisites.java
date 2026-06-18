package com.maxsolch.shop.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "payment_requisites")
public class PaymentRequisites {

    @Id
    @Column(name = "id", nullable = false)
    private Integer id = 1;

    @Column(name = "card_number", length = 64)
    private String cardNumber;

    @Column(name = "iban", length = 64)
    private String iban;

    @Column(name = "recipient", length = 255)
    private String recipient;

    @Column(name = "edrpou", length = 32)
    private String edrpou;

    @Column(name = "purpose", length = 255)
    private String purpose;

    @Column(name = "note", length = 2048)
    private String note;
}
