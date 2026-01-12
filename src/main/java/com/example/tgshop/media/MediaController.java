package com.example.tgshop.media;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("${app.media.url-prefix:/media}")
public class MediaController {

  private final MediaImageRepository mediaImageRepository;

  @GetMapping("/{filename}")
  public ResponseEntity<byte[]> getMedia(@PathVariable("filename") String filename) {
    return mediaImageRepository.findByFilename(filename)
        .map(image -> ResponseEntity.ok()
            .contentType(MediaType.parseMediaType(image.getContentType()))
            .body(image.getData()))
        .orElseGet(() -> ResponseEntity.status(HttpStatus.NOT_FOUND).build());
  }
}
