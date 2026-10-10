package com.maxsolch.shop.service;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class UserAdminServiceSearchTest {

    @Test
    void atUsernameMatchesTheStoredNameWithoutTheAt() {
        assertThat(UserAdminService.searchPattern("@Vasya")).isEqualTo("%vasya%");
    }

    @Test
    void underscoreIsLiteralAndPercentIsDropped() {
        assertThat(UserAdminService.searchPattern(" ivan_petrov ")).isEqualTo("%ivan\\_petrov%");
        assertThat(UserAdminService.searchPattern("50%")).isEqualTo("%50%");
    }

    @Test
    void blankOrOnlyAtSearchesNothing() {
        assertThat(UserAdminService.searchPattern(null)).isNull();
        assertThat(UserAdminService.searchPattern("   ")).isNull();
        assertThat(UserAdminService.searchPattern("@")).isNull();
    }
}
