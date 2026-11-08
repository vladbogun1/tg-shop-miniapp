package com.maxsolch.shop.ai.infra;

import com.maxsolch.shop.ai.domain.AiFile;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;

public interface AiFileRepository extends JpaRepository<AiFile, Long> {

    List<AiFile> findByJobIdOrderByIdAsc(long jobId);

    /** Uploaded by the admin and not yet read by any task. */
    List<AiFile> findByAdminIdAndJobIdIsNullOrderByIdAsc(long adminId);

    List<AiFile> findByIdIn(Collection<Long> ids);

    List<AiFile> findByContentSha256In(Collection<String> hashes);

    long countByJobId(long jobId);

    @Query("select f from AiFile f where f.expiresAt < :now order by f.id")
    List<AiFile> expired(@Param("now") Instant now, Pageable page);
}
