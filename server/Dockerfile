# syntax=docker/dockerfile:1

# Tailwind standalone CLI가 glibc 바이너리라서 alpine이 아닌 이미지를 쓴다.
FROM eclipse-temurin:25-jdk AS builder
WORKDIR /app
COPY . .
RUN ./gradlew --no-daemon bootJar

FROM eclipse-temurin:25-jre
WORKDIR /app

RUN groupadd --system app && useradd --system --gid app app
COPY --from=builder /app/build/libs/*.jar app.jar

USER app

EXPOSE 8080

# 힙 상한은 컨테이너 메모리 한도(compose의 mem_limit)의 70%다.
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=70", "-jar", "app.jar"]
