# syntax=docker/dockerfile:1.5
# ---------- build stage ----------
FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /app

COPY pom.xml ./
RUN --mount=type=cache,target=/root/.m2 \
    mvn -q -DskipTests dependency:go-offline

COPY src ./src
RUN --mount=type=cache,target=/root/.m2 \
    mvn -q -DskipTests package \
    && cp target/app.jar /app/app.jar

# ---------- runtime stage ----------
FROM eclipse-temurin:21-jre
WORKDIR /app

ENV TZ=Europe/Warsaw

COPY --from=build /app/app.jar /app/app.jar

EXPOSE 8080
ENTRYPOINT ["java","-jar","/app/app.jar"]
