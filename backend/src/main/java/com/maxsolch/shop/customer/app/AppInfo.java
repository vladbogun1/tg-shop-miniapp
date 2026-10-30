package com.maxsolch.shop.customer.app;

import com.maxsolch.shop.customer.infra.CustomerProperties;
import org.springframework.stereotype.Service;

/** What the frontends need to know before sign-in: the bot to open and the public links. */
@Service
public class AppInfo {

    private final CustomerProperties props;

    public AppInfo(CustomerProperties props) {
        this.props = props;
    }

    public AppInfoDto current() {
        return new AppInfoDto(
                props.getTelegram().getBotUsername(),
                props.getWebappBaseUrl(),
                props.getImageBaseUrl());
    }
}
