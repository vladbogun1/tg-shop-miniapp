package com.maxsolch.shop.media.app;

import com.maxsolch.shop.media.domain.RemoteImages;
import org.springframework.stereotype.Service;

import java.net.URI;

/**
 * A web page for the AI to read (a brand's spec table, a shop's product card), downloaded the same guarded way as
 * product photos: internal addresses are refused on every redirect hop, the body is capped at {@code maxBytes}.
 * Throws the same {@code DomainException.BadRequest} media codes as {@link RemoteImages#fetch}.
 */
@Service
public class RemotePages {

    private final RemoteImages remote;

    public RemotePages(RemoteImages remote) {
        this.remote = remote;
    }

    public RemoteImages.Fetched fetch(URI url, long maxBytes) {
        return remote.fetch(url, maxBytes);
    }
}
