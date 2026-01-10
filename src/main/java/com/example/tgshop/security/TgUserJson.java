package com.example.tgshop.security;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;

@Slf4j
public record TgUserJson(long id, String username, String firstName, String lastName) {
  private static final ObjectMapper MAPPER = new ObjectMapper();

  public static TgUserJson parse(String json) {
    if (json == null || json.isBlank()) {
      log.warn("🔐 AUTH User json parse failed: empty payload");
      return null;
    }
    try {
      JsonNode node = MAPPER.readTree(json);
      long id = node.path("id").asLong(0);
      if (id == 0) {
        log.warn("🔐 AUTH User json parse failed: missing id");
        return null;
      }
      String username = nullIfEmpty(node.path("username").asText(null));
      String firstName = nullIfEmpty(node.path("first_name").asText(null));
      String lastName = nullIfEmpty(node.path("last_name").asText(null));
      return new TgUserJson(id, username, firstName, lastName);
    } catch (Exception e) {
      log.warn("🔐 AUTH User json parse failed: invalid json", e);
      return null;
    }
  }

  private static String nullIfEmpty(String s) {
    if (s == null) return null;
    var t = s.trim();
    return t.isEmpty() ? null : t;
  }
}
