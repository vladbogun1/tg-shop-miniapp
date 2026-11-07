package com.maxsolch.shop.ai.infra;

import com.maxsolch.shop.ai.domain.AiJobBody;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;

public interface AiJobBodyRepository extends JpaRepository<AiJobBody, Long> {

    @Modifying
    @Query("delete from AiJobBody b where b.createdAt < :before")
    int deleteOlderThan(@Param("before") Instant before);
}
