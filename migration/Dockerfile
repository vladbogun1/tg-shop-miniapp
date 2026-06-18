# ---------- build stage ----------
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build

# Cache dependencies first
COPY pom.xml .
RUN mvn -q -e -B dependency:go-offline

# Build the fat jar
COPY src ./src
RUN mvn -q -e -B clean package

# ---------- runtime stage ----------
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /build/target/migration.jar /app/migration.jar

# Settings come from the environment (see README.md / docs/SPEC.md).
ENTRYPOINT ["java", "-jar", "/app/migration.jar"]
