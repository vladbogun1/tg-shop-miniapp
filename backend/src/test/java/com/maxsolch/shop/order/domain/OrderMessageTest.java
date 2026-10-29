package com.maxsolch.shop.order.domain;

import jakarta.persistence.Column;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * A just-saved chat message must carry its time: the POST answer and the WebSocket push are built
 * from the saved entity, and {@code createdAt = null} rendered as 1970-01-01 00:00 UTC («4:00»).
 * The time is stamped by {@code MessageService} (see MessageServiceTest), not by the entity.
 */
class OrderMessageTest {

    @Test
    void createdAtIsWrittenByTheServiceNotLeftToTheColumnDefault() throws NoSuchFieldException {
        Column column = OrderMessage.class.getDeclaredField("createdAt").getAnnotation(Column.class);

        assertThat(column.insertable()).isTrue();
        assertThat(column.updatable()).isFalse();
    }
}
