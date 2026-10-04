package com.maxsolch.shop.media;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class CustomerAttachmentKeyTest {

    @Test
    void acceptsOnlyTheCustomersOwnPrefix() {
        assertThat(ImageStorageService.isCustomerAttachmentKey("chat/u42/abc/proof.png", 42)).isTrue();
        assertThat(ImageStorageService.isCustomerAttachmentKey("chat/u42/abc/proof.png", 7)).isFalse();
        // u4 must not match u42's files
        assertThat(ImageStorageService.isCustomerAttachmentKey("chat/u42/abc/proof.png", 4)).isFalse();
        assertThat(ImageStorageService.isCustomerAttachmentKey("chat/abc/proof.png", 42)).isFalse();
        assertThat(ImageStorageService.isCustomerAttachmentKey("products/abc/x.png", 42)).isFalse();
        assertThat(ImageStorageService.isCustomerAttachmentKey("chat/u42/../u7/x.png", 42)).isFalse();
        assertThat(ImageStorageService.isCustomerAttachmentKey(null, 42)).isFalse();
    }
}
