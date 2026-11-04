package com.maxsolch.shop.media.infra;

import java.net.Inet4Address;
import java.net.Inet6Address;
import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;
import java.util.Locale;

/**
 * Which addresses the backend may download from on an admin's (or the AI's) say-so. The backend sits next to MySQL,
 * MinIO and imgproxy, and a cloud host answers on 169.254.169.254 with its credentials — a link to any of them would
 * turn "import a photo" into a way to read the internal network (SSRF). So: http(s) only, the standard ports only,
 * and every address the name resolves to must be public.
 *
 * <p>The HTTP client resolves the name once more when it connects; a name that flips to an internal address between
 * the two lookups (DNS rebinding) is the residual risk — accepted for an admin-only action.
 */
final class PublicAddresses {

    private PublicAddresses() {
    }

    /** Why a URL was refused. */
    enum Verdict { OK, BAD_URL, BLOCKED }

    interface Resolver {
        InetAddress[] resolve(String host) throws UnknownHostException;
    }

    static Verdict check(URI url, Resolver resolver) {
        if (url == null || url.getHost() == null || url.getRawUserInfo() != null) {
            return Verdict.BAD_URL;
        }
        String scheme = url.getScheme() == null ? "" : url.getScheme().toLowerCase(Locale.ROOT);
        int port = url.getPort();
        boolean web = scheme.equals("https") || scheme.equals("http");
        boolean standardPort = port == -1 || (scheme.equals("https") && port == 443) || (scheme.equals("http") && port == 80);
        if (!web || !standardPort) {
            return Verdict.BAD_URL;
        }
        String host = url.getHost().toLowerCase(Locale.ROOT);
        boolean literal = host.startsWith("[");
        if (host.equals("localhost") || host.endsWith(".localhost") || host.endsWith(".internal")
                || (!literal && !host.contains("."))) {
            // a bare name ("minio", "mysql") is a compose service, never a site
            return Verdict.BLOCKED;
        }
        try {
            InetAddress[] all = resolver.resolve(literal ? host.substring(1, host.length() - 1) : host);
            if (all == null || all.length == 0) {
                return Verdict.BAD_URL;
            }
            for (InetAddress a : all) {
                if (!isPublic(a)) {
                    return Verdict.BLOCKED;
                }
            }
            return Verdict.OK;
        } catch (UnknownHostException e) {
            return Verdict.BAD_URL;
        }
    }

    static boolean isPublic(InetAddress a) {
        if (a.isAnyLocalAddress() || a.isLoopbackAddress() || a.isLinkLocalAddress() || a.isSiteLocalAddress()
                || a.isMulticastAddress()) {
            return false;
        }
        byte[] b = a.getAddress();
        if (a instanceof Inet4Address) {
            return isPublicV4(b);
        }
        if (a instanceof Inet6Address) {
            if (((b[0] & 0xff) & 0xfe) == 0xfc) {
                return false; // fc00::/7 unique local
            }
            if (isV4Mapped(b)) {
                return isPublicV4(new byte[]{b[12], b[13], b[14], b[15]});
            }
        }
        return true;
    }

    private static boolean isPublicV4(byte[] b) {
        int first = b[0] & 0xff;
        int second = b[1] & 0xff;
        return first != 0 && first != 10 && first != 127 && first < 224
                && !(first == 100 && second >= 64 && second <= 127)   // carrier-grade NAT, Tailscale
                && !(first == 169 && second == 254)                  // link-local, cloud metadata
                && !(first == 172 && second >= 16 && second <= 31)
                && !(first == 192 && second == 168)
                && !(first == 192 && second == 0 && (b[2] & 0xff) == 0)
                && !(first == 198 && (second == 18 || second == 19));
    }

    private static boolean isV4Mapped(byte[] b) {
        for (int i = 0; i < 10; i++) {
            if (b[i] != 0) {
                return false;
            }
        }
        return (b[10] & 0xff) == 0xff && (b[11] & 0xff) == 0xff;
    }
}
