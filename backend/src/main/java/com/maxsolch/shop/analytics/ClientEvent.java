package com.maxsolch.shop.analytics;

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
 * One thing a customer did in the Mini App.
 *
 * <p>Deliberately flat and free of foreign keys: this is a journal for working out why a session
 * went wrong, not a modelled part of the domain, and it must never make a write to the shop fail.
 */
@Getter
@Setter
@Entity
@Table(name = "client_events")
public class ClientEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false)
    private Long id;

    @Column(name = "telegram_user_id", nullable = false)
    private long telegramUserId;

    @Column(name = "session_id", nullable = false, length = 64)
    private String sessionId;

    @Column(name = "event", nullable = false, length = 64)
    private String event;

    @Column(name = "target", length = 255)
    private String target;

    @Column(name = "path", length = 255)
    private String path;

    @Column(name = "meta", length = 512)
    private String meta;

    @Column(name = "client_time", nullable = false)
    private Instant clientTime;

    @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
    private Instant createdAt;
}
