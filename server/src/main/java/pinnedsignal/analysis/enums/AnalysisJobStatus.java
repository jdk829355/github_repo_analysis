package pinnedsignal.analysis.enums;

// Prisma가 만든 Postgres enum 타입 "AnalysisJobStatus"와 이름·값이 같아야 한다.
public enum AnalysisJobStatus {
    PENDING,
    PROCESSING,
    COMPLETED,
    FAILED
}
