package com.maxsolch.shopfixture.review.app;

import com.maxsolch.shopfixture.platform.security.AdminAccess;
import jakarta.persistence.EntityManager;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.multipart.MultipartFile;

/** An app class that knows a web type (L5), runs SQL itself (S1) and checks a right by hand (A3). */
public class ReviewScenario {
    MultipartFile file;
    JdbcTemplate jdbc;

    void load(EntityManager em) {
        em.createQuery("select 1");
        new AdminAccess().requireSuperAdmin(1L, "load");
    }
}
