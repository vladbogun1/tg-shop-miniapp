package com.maxsolch.shop.delivery.api;

import com.maxsolch.shop.delivery.app.NovaPoshtaService;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** The public directory URLs stay exactly where the apps call them: /api/np/cities, /warehouses, /warehouses/bbox. */
class NovaPoshtaControllerTest {

    private final NovaPoshtaService service = mock(NovaPoshtaService.class);
    private final MockMvc mvc = MockMvcBuilders.standaloneSetup(new NovaPoshtaController(service)).build();

    @Test
    void citiesAreSearchedByQuery() throws Exception {
        when(service.searchCities("Киев")).thenReturn(List.of());

        mvc.perform(get("/api/np/cities").param("q", "Киев"))
                .andExpect(status().isOk())
                .andExpect(content().json("[]"));

        verify(service).searchCities("Киев");
    }

    @Test
    void warehousesNeedACityRef() throws Exception {
        mvc.perform(get("/api/np/warehouses")).andExpect(status().isBadRequest());

        mvc.perform(get("/api/np/warehouses").param("cityRef", "c1").param("q", "5")).andExpect(status().isOk());

        verify(service).searchWarehouses("c1", "5");
    }

    @Test
    void bboxHasTheOldDefaults() throws Exception {
        mvc.perform(get("/api/np/warehouses/bbox")
                        .param("minLat", "50").param("maxLat", "51").param("minLng", "30").param("maxLng", "31"))
                .andExpect(status().isOk());

        verify(service).warehousesInBox(50, 51, 30, 31, "all", null, 1200);
    }
}
