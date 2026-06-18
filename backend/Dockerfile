# ---------- build ----------
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build

# cache dependencies first
COPY pom.xml .
RUN mvn -q -B dependency:go-offline

# build
COPY src ./src
RUN mvn -q -B clean package -DskipTests

# ---------- run ----------
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /build/target/app.jar /app/app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
