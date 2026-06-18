package com.maxsolch.shop.web.controller;

import com.maxsolch.shop.config.AppProperties;
import org.springframework.boot.info.BuildProperties;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;

import java.time.Instant;

@Controller
public class HomeController {

    private final AppProperties props;
    private final JdbcTemplate jdbcTemplate;
    private final BuildProperties buildProperties; // may be null if build-info not generated

    public HomeController(AppProperties props,
                          JdbcTemplate jdbcTemplate,
                          org.springframework.beans.factory.ObjectProvider<BuildProperties> buildPropertiesProvider) {
        this.props = props;
        this.jdbcTemplate = jdbcTemplate;
        this.buildProperties = buildPropertiesProvider.getIfAvailable();
    }

    @GetMapping("/")
    public String home(Model model) {
        model.addAttribute("appName", "tg-shop-v2 backend");
        model.addAttribute("version", buildProperties != null ? buildProperties.getVersion() : "dev");
        model.addAttribute("buildTime",
                buildProperties != null && buildProperties.getTime() != null
                        ? buildProperties.getTime().toString()
                        : Instant.now().toString());
        model.addAttribute("dbUp", checkDb());
        model.addAttribute("webappBaseUrl", emptyToNull(props.getWebappBaseUrl()));
        model.addAttribute("adminBaseUrl", emptyToNull(props.getAdminBaseUrl()));
        model.addAttribute("imageBaseUrl", props.getImageBaseUrl());
        model.addAttribute("botUsername", props.getTelegram().getBotUsername());
        return "home";
    }

    private boolean checkDb() {
        try {
            Integer one = jdbcTemplate.queryForObject("SELECT 1", Integer.class);
            return one != null && one == 1;
        } catch (DataAccessException e) {
            return false;
        }
    }

    private static String emptyToNull(String s) {
        return (s == null || s.isBlank()) ? null : s;
    }
}
