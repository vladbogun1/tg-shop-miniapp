package com.maxsolch.shop.ai.domain;

import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** What an application changed, what breaks the promise of the safe acceptance, what can still be given back. */
class ApplyDiffTest {

    @Test
    void diffListsOnlyTheFieldsThatDiffer() {
        Map<String, String> before = Map.of("title", "Viper", "spec:dpi", "800");
        Map<String, String> after = Map.of("title", "Viper", "spec:dpi", "800", "spec:weight", "54", "description", "text");

        Map<String, FieldChange> diff = ApplyDiff.diff(before, after);

        assertThat(diff).containsOnlyKeys("spec:weight", "description");
        assertThat(diff.get("spec:weight")).isEqualTo(new FieldChange(null, "54"));
    }

    @Test
    void aRemovedFieldIsAChangeToo() {
        Map<String, FieldChange> diff = ApplyDiff.diff(Map.of("spec:dpi", "800"), Map.of());

        assertThat(diff.get("spec:dpi")).isEqualTo(new FieldChange("800", null));
    }

    @Test
    void fillingEmptySpecsAndDescriptionIsSafe() {
        Map<String, FieldChange> changes = Map.of("spec:weight", new FieldChange(null, "54"),
                "description", new FieldChange(null, "text"));

        assertThat(ApplyDiff.violations(changes)).isEmpty();
    }

    @Test
    void replacingAFilledValueTouchingTheTitleOrRemovingBreaksThePromise() {
        Map<String, FieldChange> changes = new HashMap<>();
        changes.put("spec:dpi", new FieldChange("800", "1600"));
        changes.put("title", new FieldChange(null, "New title"));
        changes.put("brand", new FieldChange(null, "id"));
        changes.put("spec:color", new FieldChange("black", null));

        assertThat(ApplyDiff.violations(changes)).containsOnlyKeys("spec:dpi", "title", "brand", "spec:color");
    }

    @Test
    void onlyFieldsStillHoldingTheWrittenValueCanBeGivenBack() {
        Map<String, FieldChange> changes = Map.of("spec:weight", new FieldChange(null, "54"),
                "description", new FieldChange(null, "text"));
        Map<String, String> current = Map.of("spec:weight", "54", "description", "edited by hand");

        assertThat(ApplyDiff.revertable(changes, current)).containsOnlyKeys("spec:weight");
    }
}
