package com.maxsolch.shop.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

/**
 * A canned chat reply the admin inserts with ⚡ in the order chat. One text per language; the one
 * matching the customer's language is picked when it is inserted (see ReplyTemplateService).
 */
@Getter
@Setter
@Entity
@Table(name = "reply_templates")
public class ReplyTemplate {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false)
    private Long id;

    @Column(name = "title", nullable = false, length = 128)
    private String title;

    @Column(name = "body_ru", nullable = false, columnDefinition = "TEXT")
    private String bodyRu;

    @Column(name = "body_uk", columnDefinition = "TEXT")
    private String bodyUk;

    @Column(name = "body_en", columnDefinition = "TEXT")
    private String bodyEn;

    @Column(name = "sort", nullable = false)
    private int sort = 0;

    @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false, insertable = false, updatable = false)
    private Instant updatedAt;
}
