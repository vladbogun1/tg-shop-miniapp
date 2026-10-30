package com.maxsolch.shop.media.domain;

import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** The fakes keep the promises of their ports, so a test that uses them tests what the real adapter would do. */
class PortFakesTest {

    @Test
    void storedBytesComeBackWithTheirContentType() throws Exception {
        InMemoryObjectStore store = new InMemoryObjectStore();
        store.put("a/b.png", new ByteArrayInputStream(new byte[] {1, 2, 3}), 3, "image/png");

        ObjectStore.Stored got = store.get("a/b.png");

        assertThat(got.contentType()).isEqualTo("image/png");
        assertThat(got.stream().readAllBytes()).containsExactly(1, 2, 3);
    }

    @Test
    void aMissingObjectIsNullAndARemovalIsQuiet() {
        InMemoryObjectStore store = new InMemoryObjectStore();

        assertThat(store.get("nope")).isNull();
        store.removeQuietly("nope");
        store.put("k", new ByteArrayInputStream(new byte[0]), 0, "x/y");
        store.removeQuietly("k");
        assertThat(store.contains("k")).isFalse();
    }

    @Test
    void aStorageThatRefusesThrowsIllegalState() {
        InMemoryObjectStore store = new InMemoryObjectStore().refusing();

        assertThatThrownBy(() -> store.put("k", new ByteArrayInputStream(new byte[0]), 0, "x/y"))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void imgproxyThatIsOffAnswersNullSoTheCallerFallsBack() {
        FakeImgproxy off = new FakeImgproxy(false);

        assertThat(off.fit("k", 320)).isNull();
        assertThat(off.asked()).containsExactly("k@320");
        assertThat(new FakeImgproxy(true).fit("k", 320).contentType()).isEqualTo("image/webp");
    }
}
