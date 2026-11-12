package com.maxsolch.shop.settings.app;

import com.maxsolch.shop.settings.domain.SettingDefinition;
import com.maxsolch.shop.settings.domain.SettingType;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

/** Tabs of the «Доставка» settings page: every Nova Poshta key is on one of the four, the other groups have none. */
class SettingSubgroupTest {

    private static final Set<String> NP_TABS = Set.of("checkout", "ttn", "boxes", "tracking");

    @Test
    void everyNovaPoshtaSettingIsOnOneOfTheFourTabs() {
        List<SettingDefinition> np = AllSettings.catalog().all().stream()
                .filter(d -> d.group().equals("novaposhta")).toList();
        assertThat(np).hasSize(30);
        assertThat(np).allSatisfy(d -> assertThat(NP_TABS).contains(d.subgroup()));

        Map<String, Long> perTab = np.stream().collect(Collectors.groupingBy(SettingDefinition::subgroup, Collectors.counting()));
        assertThat(perTab).containsExactlyInAnyOrderEntriesOf(Map.of("checkout", 6L, "ttn", 6L, "boxes", 8L, "tracking", 10L));
    }

    @Test
    void otherGroupsAreOneList() {
        assertThat(AllSettings.catalog().all().stream().filter(d -> !d.group().equals("novaposhta")))
                .allSatisfy(d -> assertThat(d.subgroup()).isNull());
    }

    @Test
    void checkAndSubgroupKeepEachOther() {
        SettingDefinition.Check rule = (label, text) -> text;
        SettingDefinition d = new SettingDefinition("k", "g", SettingType.STRING, "L", "", "", null, null, 5, null);
        assertThat(d.withSubgroup("ttn").withCheck(rule).subgroup()).isEqualTo("ttn");
        assertThat(d.withCheck(rule).withSubgroup("ttn").check()).isSameAs(rule);
    }
}
