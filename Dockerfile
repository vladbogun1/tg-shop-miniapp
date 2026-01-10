# ---------- build stage ----------
FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /app

COPY pom.xml ./
RUN mvn -q -DskipTests dependency:go-offline

COPY src ./src
RUN mvn -q -DskipTests package \
    && JAR_PATH=$(ls target/*.jar | grep -v '\.original$' | head -n 1) \
    && cp "$JAR_PATH" /app/app.jar

# ---------- runtime stage ----------
FROM eclipse-temurin:21-jre
WORKDIR /app

ENV TZ=Europe/Warsaw

COPY --from=build /app/app.jar /app/app.jar

EXPOSE 8080
ENTRYPOINT ["java","-jar","/app/app.jar"]
