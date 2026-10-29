package pinnedsignal.global.common;

// lib/constants.ts와 같은 값.
public final class AnalysisConstants {

    public static final int MAX_REPOS = 50;
    public static final int MAX_COMMITS_PER_REPO = 300;
    public static final int MAX_CONCURRENT_ANALYSIS = 3;
    public static final long ANALYSIS_TIMEOUT_MS = 600_000;
    public static final long LLM_REQUEST_TIMEOUT_MS = 120_000;
    public static final int README_MAX_SIZE_BYTES = 10_240;
    public static final String GITHUB_API_VERSION = "2022-11-28";
    public static final String VERIFICATION_REPO_OWNER = "jdk829355";
    public static final String VERIFICATION_REPO_NAME = "github_repo_analysis";
    public static final String VERIFICATION_REPO_URL =
            "https://github.com/" + VERIFICATION_REPO_OWNER + "/" + VERIFICATION_REPO_NAME;

    private AnalysisConstants() {
    }
}
