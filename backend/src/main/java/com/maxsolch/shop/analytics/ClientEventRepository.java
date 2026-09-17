package com.maxsolch.shop.analytics;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;

public interface ClientEventRepository extends JpaRepository<ClientEvent, Long> {

    @Modifying
    @Query("delete from ClientEvent e where e.createdAt < :before")
    int deleteOlderThan(@Param("before") Instant before);
}
