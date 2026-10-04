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

/** One sent (or running) broadcast — the history shown on the «Рассылки» page (V29). */
@Getter
@Setter
@Entity
@Table(name = "broadcasts")
public class Broadcast {

    public static final String RUNNING = "RUNNING";
    public static final String DONE = "DONE";
    /** The backend restarted mid-send: the counters are what was reached before that. */
    public static final String INTERRUPTED = "INTERRUPTED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false)
    private Long id;

    @Column(name = "admin_id")
    private Long adminId;

    @Column(name = "admin_name", length = 255)
    private String adminName;

    @Column(name = "text", columnDefinition = "TEXT", nullable = false)
    private String text;

    @Column(name = "text_uk", columnDefinition = "TEXT")
    private String textUk;

    @Column(name = "text_ru", columnDefinition = "TEXT")
    private String textRu;

    @Column(name = "text_en", columnDefinition = "TEXT")
    private String textEn;

    @Column(name = "audience", nullable = false, length = 16)
    private String audience;

    @Column(name = "lang", length = 8)
    private String lang;

    @Column(name = "with_button", nullable = false)
    private boolean withButton;

    @Column(name = "status", nullable = false, length = 16)
    private String status;

    @Column(name = "total", nullable = false)
    private int total;

    @Column(name = "sent", nullable = false)
    private int sent;

    @Column(name = "failed", nullable = false)
    private int failed;

    @Column(name = "blocked", nullable = false)
    private int blocked;

    @Column(name = "started_at", nullable = false)
    private Instant startedAt;

    @Column(name = "finished_at")
    private Instant finishedAt;
}
