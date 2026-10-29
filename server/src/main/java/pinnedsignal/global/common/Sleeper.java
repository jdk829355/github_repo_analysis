package pinnedsignal.global.common;

// 재시도 사이의 대기. 테스트에서 실제로 기다리지 않고 대기 시간만 확인하려고 분리했다.
@FunctionalInterface
public interface Sleeper {

    void sleep(long millis);
}
