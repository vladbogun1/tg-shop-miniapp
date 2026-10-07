package com.maxsolch.shop.web.controller;

import com.maxsolch.shop.i18n.Messages;
import com.maxsolch.shop.payment.ReceiptService;
import com.maxsolch.shop.payment.ReceiptSigner;
import com.maxsolch.shop.web.ForbiddenException;
import com.maxsolch.shop.web.NotFoundException;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Downloads a payment receipt PDF through a signed, expiring link ({@link ReceiptSigner}).
 *
 * <p>Not behind the JWT filter (SecurityConfig permitAll): the Telegram Mini App downloads with
 * {@code Telegram.WebApp.downloadFile} / {@code openLink}, and the site with a plain link — none
 * can send an Authorization header. The links are issued only by the order-owner and admin
 * receipt lists. The PDF is fetched from monobank on every call and never cached anywhere.
 */
@RestController
@Tag(name = "Receipts", description = "Signed download of payment receipts (fiscal checks, bank receipt)")
public class ReceiptFileController {

    private final ReceiptSigner signer;
    private final ReceiptService receipts;
    private final Messages messages;

    public ReceiptFileController(ReceiptSigner signer, ReceiptService receipts, Messages messages) {
        this.signer = signer;
        this.receipts = receipts;
        this.messages = messages;
    }

    @GetMapping("/api/receipts/file")
    @Operation(summary = "Download a receipt PDF using a signed link from the receipts list")
    public ResponseEntity<byte[]> file(@RequestParam("inv") String inv,
                                       @RequestParam("kind") String kind,
                                       @RequestParam(value = "check", required = false) String check,
                                       @RequestParam("exp") long exp,
                                       @RequestParam("sig") String sig) {
        if (!signer.isValid(inv, kind, check, exp, sig)) {
            throw new ForbiddenException(messages.current("api.media.expired"));
        }
        ReceiptService.Pdf pdf = receipts.file(inv, kind, check)
                .orElseThrow(() -> new NotFoundException(messages.current("api.media.notFound")));
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .cacheControl(CacheControl.noStore().cachePrivate())
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename(pdf.fileName()).build().toString())
                .header("X-Content-Type-Options", "nosniff")
                .body(pdf.bytes());
    }
}
