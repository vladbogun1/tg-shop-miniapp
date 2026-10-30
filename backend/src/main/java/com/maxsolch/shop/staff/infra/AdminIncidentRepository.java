package com.maxsolch.shop.staff.infra;

import com.maxsolch.shop.staff.domain.AdminIncident;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Set;

public interface AdminIncidentRepository extends JpaRepository<AdminIncident, Long> {

    List<AdminIncident> findAllByOrderByStatusAscCreatedAtDesc();

    List<AdminIncident> findByCodeIn(Set<String> codes);
}
