package com.maxsolch.shop.customer.infra;

import com.maxsolch.shop.customer.domain.CustomerFlag;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CustomerFlagRepository extends JpaRepository<CustomerFlag, Long> {
}
