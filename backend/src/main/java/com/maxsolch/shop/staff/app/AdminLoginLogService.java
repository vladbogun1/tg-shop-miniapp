package com.maxsolch.shop.staff.app;

import com.maxsolch.shop.staff.domain.LoginMethod;
import com.maxsolch.shop.platform.web.UserAgents;
import com.maxsolch.shop.platform.web.GeoIpLookup;
import lombok.extern.slf4j.Slf4j;
import com.maxsolch.shop.staff.domain.LoginLogEntry;
import com.maxsolch.shop.staff.infra.AdminLoginLogStore;
import org.springframework.stereotype.Service;

import java.util.List;

import static com.maxsolch.shop.platform.util.Texts.cut;

/**
 * Admin sign-in history ({@code admin_login_log}, V37): every attempt — success or not — with the
 * place (offline GeoIP, see {@link GeoIpLookup}), the device ("Windows · Chrome") and whether that
 * device / city was seen before in this admin's successful sign-ins. Kept {@value #RETENTION_DAYS}
 * days. A failure to write is logged and never breaks the sign-in itself.
 */
@Slf4j
@Service
public class AdminLoginLogService {

    public static final int RETENTION_DAYS = 90;

    /** What happened. Only {@code OK} is a finished sign-in. */
    public enum Result {
        OK,
        BAD_PASSWORD,
        UNKNOWN_LOGIN,
        BAD_CODE,
        LOCKED,
        NOT_ADMIN,
        BAD_TELEGRAM
    }

    /** What the second step was. */
    public enum SecondFactor { TOTP, TRUSTED_DEVICE, SETUP }

    /** What was written: the place / device shown to the admin and in the Telegram alert. */
    public record Recorded(String place, String device, boolean newDevice, boolean newCity) {
    }

    private final AdminLoginLogStore store;
    private final GeoIpLookup geoIp;

    public AdminLoginLogService(AdminLoginLogStore store, GeoIpLookup geoIp) {
        this.store = store;
        this.geoIp = geoIp;
    }

    public Recorded record(Long adminId, String login, LoginMethod method, Result result,
                           SecondFactor secondFactor, ClientInfo client) {
        String device = UserAgents.osAndBrowser(client.userAgent());
        GeoIpLookup.Place place = geoIp.lookup(client.ip()).orElse(null);
        String city = place == null ? null : place.city();
        String country = place == null ? null : place.country();
        boolean newDevice = false;
        boolean newCity = false;
        try {
            if (adminId != null) {
                newDevice = !seen(adminId, "device_label", device);
                newCity = city != null && !seen(adminId, "city", city);
            }
            store.insert(adminId, cut(login, 128), method.name(), result.name(),
                    secondFactor == null ? null : secondFactor.name(), cut(client.ip(), 45), cut(country, 100),
                    cut(city, 120), cut(client.userAgent(), 255), cut(device, 120), newDevice, newCity);
        } catch (Exception e) {
            log.warn("Failed to write admin login log: {}", e.getMessage());
        }
        return new Recorded(placeLabel(city, country), device, newDevice, newCity);
    }

    /** Was this value seen in an earlier successful sign-in of the admin? */
    private boolean seen(long adminId, String column, String value) {
        return store.seen(adminId, column, value);
    }

    public List<LoginLogEntry> recent(long adminId, int limit) {
        return store.recent(adminId, limit);
    }

    static String placeLabel(String city, String country) {
        if (city != null && !city.isBlank()) {
            return city;
        }
        if (country != null && !country.isBlank()) {
            return country;
        }
        return "место неизвестно";
    }
}
