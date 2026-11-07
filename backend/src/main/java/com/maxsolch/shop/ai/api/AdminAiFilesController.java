package com.maxsolch.shop.ai.api;

import com.maxsolch.shop.ai.app.AiFiles;
import com.maxsolch.shop.ai.domain.AiError;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.security.RequiredAdmin;
import com.maxsolch.shop.platform.security.RequiresFinance;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;

/**
 * Pictures of invoices and order screenshots for «Прочитать с ИИ» in the supply. Purchase data, so for an admin with
 * the finance right; every admin sees only his own files. Kept 7 days.
 */
@RestController
@RequestMapping("/api/admin/ai/files")
@RequiredAdmin
@RequiresFinance
@Tag(name = "Admin AI Files", description = "Upload documents for the supply reader (JPEG, PNG, WEBP, PDF), preview, delete")
@SecurityRequirement(name = "bearer-jwt")
public class AdminAiFilesController {

    private final AiFiles files;

    public AdminAiFilesController(AiFiles files) {
        this.files = files;
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "Upload one file (up to 10 MB; JPEG, PNG, WEBP or PDF of up to 10 pages — the type is read from "
            + "the bytes). Answers with its pictures: a PDF gives one per page. At most 10 pictures wait per admin. "
            + "Stored 7 days, re-encoded at 1600 px without metadata")
    public List<AiFiles.FileDto> upload(@RequestParam("file") MultipartFile file) {
        try {
            return files.upload(file.getOriginalFilename(), file.getBytes());
        } catch (IOException e) {
            throw new DomainException.BadRequest(AiError.FILE_BROKEN);
        }
    }

    @GetMapping
    @Operation(summary = "My uploaded pictures that no task has taken yet")
    public List<AiFiles.FileDto> waiting() {
        return files.waiting();
    }

    @GetMapping("/{id}/content")
    @Operation(summary = "The picture itself (my own files only)")
    public ResponseEntity<byte[]> content(@PathVariable long id) {
        AiFiles.Content c = files.content(id);
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(c.mime()))
                .cacheControl(CacheControl.noStore()).body(c.bytes());
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete a picture (a PDF page deletes the whole PDF)")
    public ResponseEntity<Void> delete(@PathVariable long id) {
        files.delete(id);
        return ResponseEntity.noContent().build();
    }
}
