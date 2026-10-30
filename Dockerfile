# syntax=docker/dockerfile:1

# Tailwind standalone CLI가 glibc 바이너리라서 alpine이 아닌 이미지를 쓴다.
FROM eclipse-temurin:25-jdk AS builder
WORKDIR /app
# 빌드 컨텍스트가 저장소 루트라서 빌드에 필요한 것만 복사한다. 문서만 바뀌어도 캐시가 깨지지 않는다.
COPY gradlew settings.gradle build.gradle ./
COPY gradle gradle
COPY src src
RUN ./gradlew --no-daemon bootJar

FROM eclipse-temurin:25-jre
WORKDIR /app

RUN groupadd --system app && useradd --system --gid app app
COPY --from=builder /app/build/libs/*.jar app.jar

USER app

EXPOSE 8080

# 서버 커널에 메모리 cgroup이 없어 compose의 mem_limit이 무시된다. 비율로 잡으면 서버 메모리 전체가 기준이 되므로 힙 상한을 직접 정한다.
ENTRYPOINT ["java", "-Xmx700m", "-jar", "app.jar"]
