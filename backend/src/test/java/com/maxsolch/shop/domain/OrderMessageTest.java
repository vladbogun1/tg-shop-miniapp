package com.maxsolch.shop.domain;

import jakarta.persistence.Column;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * A just-saved chat message must carry its time: the POST answer and the WebSocket push are built
 * from the saved entity, and {@code createdAt = null} rendered as 1970-01-01 00:00 UTC («4:00»).
 */
class OrderMessageTest {

    @Test
    void prePersistStampsWholeSecondsNow() {
        OrderMessage m = new OrderMessage();
        Instant before = Instant.now().minusSeconds(1);

        m.prePersist();

        assertThat(m.getCreatedAt()).isNotNull().isAfter(before).isBeforeOrEqualTo(Instant.now());
        assertThat(m.getCreatedAt().getNano()).isZero();
    }

    @Test
    void prePersistKeepsAnExplicitTime() {
        OrderMessage m = new OrderMessage();
        Instant at = Instant.parse("2026-10-07T12:34:56Z");
        m.setCreatedAt(at);

        m.prePersist();

        assertThat(m.getCreatedAt()).isEqualTo(at);
    }

    @Test
    void createdAtIsWrittenByTheEntityNotLeftToTheColumnDefault() throws NoSuchFieldException {
        Column column = OrderMessage.class.getDeclaredField("createdAt").getAnnotation(Column.class);

        assertThat(column.insertable()).isTrue();
        assertThat(column.updatable()).isFalse();
    }
}
