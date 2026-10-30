package com.maxsolch.shop.staff.infra;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class StaffStartupCheckTest {

    private List<String> run(String password, boolean dev) {
        StaffProperties p = new StaffProperties();
        p.getSecurity().setAdminPassword(password);
        List<String> fatal = new ArrayList<>();
        new StaffStartupCheck(p).check(dev, fatal);
        return fatal;
    }

    @Test
    void placeholderAdminPasswordOutsideDev_isFatal() {
        assertThat(run("change_me_admin", false)).singleElement().asString().contains("ADMIN_PASSWORD");
    }

    @Test
    void placeholderAdminPasswordUnderDev_isOnlyWarned() {
        assertThat(run("admin", true)).isEmpty();
    }

    @Test
    void realOrEmptyPassword_passes() {
        assertThat(run("a-real-password", false)).isEmpty();
        assertThat(run(null, false)).isEmpty();
    }
}
