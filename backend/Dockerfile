# ---------- build ----------
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build

# cache dependencies first
COPY pom.xml .
RUN mvn -q -B dependency:go-offline

# build
COPY src ./src
RUN mvn -q -B clean package -DskipTests

# ---------- GeoIP base (users map in the admin) ----------
# DB-IP "IP to City Lite" — free, no key, CC BY 4.0 (attribution is shown on the map).
# Published monthly as dbip-city-lite-YYYY-MM.mmdb.gz; this month's file may not be out yet on the
# 1st, so the previous month is the fallback. GEOIP_DB_URL overrides the source (e.g. a mirror).
# A failed download never fails the build: the backend just starts with the map turned off.
# To refresh the base: rebuild the image (or mount a newer file and point GEOIP_PATH at it).
FROM alpine:3.20 AS geoip
ARG GEOIP_DB_URL=""
RUN mkdir -p /geoip && cd /geoip && ( \
      set -e; \
      if [ -n "$GEOIP_DB_URL" ]; then urls="$GEOIP_DB_URL"; else \
        this=$(date -u +%Y-%m); \
        prev=$(date -u -d "@$(( $(date -u +%s) - 32*86400 ))" +%Y-%m 2>/dev/null || echo "$this"); \
        urls="https://download.db-ip.com/free/dbip-city-lite-$this.mmdb.gz https://download.db-ip.com/free/dbip-city-lite-$prev.mmdb.gz"; \
      fi; \
      for u in $urls; do \
        if wget -q -T 60 -O db.mmdb.gz "$u" && gunzip -f db.mmdb.gz && [ -s db.mmdb ]; then \
          mv db.mmdb dbip-city-lite.mmdb; echo "GeoIP base: $u"; break; \
        fi; \
        rm -f db.mmdb.gz db.mmdb; \
      done \
    ) || true; \
    [ -s /geoip/dbip-city-lite.mmdb ] || echo "GeoIP base not downloaded — users map will be off"

# ---------- run ----------
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /build/target/app.jar /app/app.jar
COPY --from=geoip /geoip /app/geoip
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
