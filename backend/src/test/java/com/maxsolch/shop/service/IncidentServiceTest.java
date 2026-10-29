package com.maxsolch.shop.service;

import com.maxsolch.shop.domain.AdminIncident;
import com.maxsolch.shop.repository.AdminIncidentRepository;
import com.maxsolch.shop.platform.error.BadRequestException;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class IncidentServiceTest {

    private final AdminIncidentRepository repository = mock(AdminIncidentRepository.class);
    private final IncidentService service = new IncidentService(repository, mock(JdbcTemplate.class));

    private static IncidentService.Found found(String code) {
        return new IncidentService.Found(code, "t", "ref", "HIGH", "facts", "hyp", "sug");
    }

    private static AdminIncident row(String code, String status) {
        AdminIncident i = new AdminIncident();
        i.setCode(code);
        i.setStatus(status);
        return i;
    }

    @Test
    @SuppressWarnings("unchecked")
    void sync_addsNewCases_once() {
        when(repository.findAll()).thenReturn(List.of(row("auto:a", AdminIncident.OPEN)));
        service.sync(List.of(found("auto:a"), found("auto:b")));
        ArgumentCaptor<List<AdminIncident>> saved = ArgumentCaptor.forClass(List.class);
        verify(repository).saveAll(saved.capture());
        assertThat(saved.getValue()).extracting(AdminIncident::getCode).containsExactly("auto:b");
        assertThat(saved.getValue().get(0).getStatus()).isEqualTo(AdminIncident.OPEN);
    }

    @Test
    void sync_closesAutoCaseThatIsGone_butNotHandMadeOrResolved() {
        AdminIncident gone = row("auto:gone", AdminIncident.OPEN);
        AdminIncident manual = row("case:manual-1", AdminIncident.OPEN);
        AdminIncident resolved = row("auto:old", AdminIncident.RESOLVED);
        when(repository.findAll()).thenReturn(List.of(gone, manual, resolved));
        service.sync(List.of());
        assertThat(gone.getStatus()).isEqualTo(AdminIncident.RESOLVED);
        assertThat(gone.getResolvedBy()).isEqualTo("система");
        assertThat(manual.getStatus()).isEqualTo(AdminIncident.OPEN);
        verify(repository, never()).save(manual);
        verify(repository, never()).save(resolved);
    }

    @Test
    void sync_resolvedCaseFoundAgain_staysResolved() {
        AdminIncident resolved = row("auto:a", AdminIncident.RESOLVED);
        when(repository.findAll()).thenReturn(List.of(resolved));
        service.sync(List.of(found("auto:a")));
        assertThat(resolved.getStatus()).isEqualTo(AdminIncident.RESOLVED);
        verify(repository).saveAll(List.of());
    }

    @Test
    void resolve_needsAComment() {
        when(repository.findById(1L)).thenReturn(Optional.of(row("auto:a", AdminIncident.OPEN)));
        assertThatThrownBy(() -> service.resolve(1L, " ", "owner")).isInstanceOf(BadRequestException.class);
        when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        AdminIncident done = service.resolve(1L, "удержали за доставку", "owner");
        assertThat(done.getStatus()).isEqualTo(AdminIncident.RESOLVED);
        assertThat(done.getResolvedBy()).isEqualTo("owner");
    }
}
