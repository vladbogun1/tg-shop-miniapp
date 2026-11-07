package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.domain.AiFile;
import com.maxsolch.shop.ai.domain.AiFileObjects;
import com.maxsolch.shop.ai.infra.AiFileRepository;
import com.maxsolch.shop.it.AbstractMysqlIT;
import com.maxsolch.shop.platform.jobs.Workers;
import com.maxsolch.shop.platform.web.CurrentActor;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/**
 * The 7-day rule on a real MySQL: a file past its time leaves the table and the storage, a fresh one stays.
 * The storage is a double (there is no MinIO in the integration tests): it only has to see the delete.
 */
class AiFilesIT extends AbstractMysqlIT {

    @Autowired
    AiFileRepository repo;

    /** An in-memory bucket. */
    static class MemoryObjects implements AiFileObjects {
        final Map<String, byte[]> map = new HashMap<>();

        @Override
        public void ensureBucket() {
        }

        @Override
        public void put(String key, byte[] bytes, String contentType) {
            map.put(key, bytes);
        }

        @Override
        public byte[] get(String key) {
            return map.get(key);
        }

        @Override
        public void removeQuietly(String key) {
            map.remove(key);
        }
    }

    private AiFile stored(MemoryObjects bucket, Instant uploaded) {
        String key = "it/" + UUID.randomUUID() + ".png";
        bucket.put(key, new byte[]{1, 2, 3}, "image/png");
        return repo.save(AiFile.of(9_100_000L + (long) (Math.random() * 1000), UUID.randomUUID().toString(), "a.png", key,
                "image/png", 3, null, uploaded));
    }

    @Test
    void anExpiredFileLeavesTheTableAndTheStorageAFreshOneStays() {
        MemoryObjects bucket = new MemoryObjects();
        Instant now = Instant.now();
        AiFiles files = new AiFiles(repo, bucket, new AiImagePrep(new Workers()), mock(CurrentActor.class), Clock.systemUTC());
        AiFile old = stored(bucket, now.minus(AiFile.KEEP).minus(Duration.ofHours(1)));
        AiFile fresh = stored(bucket, now.minus(Duration.ofDays(1)));

        int removed = files.purgeExpired();

        assertThat(removed).isGreaterThanOrEqualTo(1);
        assertThat(repo.findById(old.getId())).isEmpty();
        assertThat(bucket.get(old.getObjectKey())).isNull();
        assertThat(repo.findById(fresh.getId())).isPresent();
        assertThat(bucket.get(fresh.getObjectKey())).isNotNull();
        repo.deleteById(fresh.getId());
    }
}
