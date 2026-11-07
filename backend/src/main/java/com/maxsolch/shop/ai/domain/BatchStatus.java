package com.maxsolch.shop.ai.domain;

/**
 * The state of a batch (V90) and the moves between states:
 * <pre>
 * RUNNING -> PAUSED | DONE | CANCELED
 * PAUSED  -> RUNNING | DONE (nothing was left to continue) | CANCELED
 * </pre>
 * DONE and CANCELED do not leave. A paused batch never continues by itself: a person presses «Продолжить».
 */
public enum BatchStatus {
    RUNNING,
    PAUSED,
    DONE,
    CANCELED;

    public boolean open() {
        return this == RUNNING || this == PAUSED;
    }
}
