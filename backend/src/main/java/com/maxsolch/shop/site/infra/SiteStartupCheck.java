package com.maxsolch.shop.site.infra;

import com.maxsolch.shop.platform.config.StartupCheck;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.List;

/** An unsigned revalidation webhook lets anyone make the site rebuild pages. */
@Slf4j
@Component
class SiteStartupCheck implements StartupCheck {

    private final SiteProperties props;

    SiteStartupCheck(SiteProperties props) {
        this.props = props;
    }

    @Override
    public void check(boolean dev, List<String> fatal) {
        SiteProperties.Site site = props.getSite();
        if (site.getRevalidateUrl() != null && !site.getRevalidateUrl().isBlank()
                && (site.getRevalidateSecret() == null || site.getRevalidateSecret().isBlank())) {
            log.warn("SECURITY: SITE_REVALIDATE_URL задан, а SITE_REVALIDATE_SECRET пуст — "
                    + "сайт должен отклонять неподписанные запросы ревалидации.");
        }
    }
}
