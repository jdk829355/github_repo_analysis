package pinnedsignal.analysis.service;

// 큐에서 집어 PROCESSING으로 바꾼 작업.
public record ClaimedJob(String id, String githubProfile) {
}
