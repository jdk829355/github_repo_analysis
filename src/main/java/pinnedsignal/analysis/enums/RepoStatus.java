package pinnedsignal.analysis.enums;

// repositories.status(text). V2 이전에 만들어진 행은 모두 COMPLETED다.
public enum RepoStatus {
    PENDING,
    ANALYZING,
    COMPLETED,
    SKIPPED,
    FAILED
}
