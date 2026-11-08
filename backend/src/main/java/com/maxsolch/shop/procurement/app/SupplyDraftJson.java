package com.maxsolch.shop.procurement.app;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.maxsolch.shop.procurement.domain.supplyai.DraftState;
import org.springframework.stereotype.Component;

/**
 * {@link DraftState} ↔ the text of {@code supply_drafts.state}. Own mapper: unknown fields are skipped, so a state
 * written by a newer build still opens after a rollback.
 */
@Component
class SupplyDraftJson {

    private final ObjectMapper mapper = JsonMapper.builder()
            .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
            .findAndAddModules()
            .build();

    DraftState read(String text) {
        try {
            return mapper.readValue(text, DraftState.class);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("supply draft state unreadable", e);
        }
    }

    String write(DraftState state) {
        try {
            return mapper.writeValueAsString(state);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("supply draft state not writable", e);
        }
    }

    JsonNode tree(Object value) {
        return mapper.valueToTree(value);
    }

    <T> T convert(JsonNode node, Class<T> type) {
        try {
            return mapper.treeToValue(node, type);
        } catch (JsonProcessingException | IllegalArgumentException e) {
            return null;
        }
    }
}
