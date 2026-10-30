package pinnedsignal.global.util;

import static org.assertj.core.api.Assertions.assertThat;
import static pinnedsignal.global.util.CommitFilter.isMeaningfulCommit;
import static pinnedsignal.global.util.CommitFilter.isMergeCommit;

import java.util.List;
import java.util.function.Function;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

// tests/lib/commit-filter.test.ts의 사례를 그대로 옮기고, JS와 Java 정규식이 갈릴 수 있는 사례를 더했다.
class CommitFilterTest {

    @Test
    void detectsMergeCommits() {
        assertThat(isMergeCommit("Merge pull request #123 from feature branch")).isTrue();
        assertThat(isMergeCommit("Merge branch main into feature")).isTrue();
        assertThat(isMergeCommit("merged with develop")).isTrue();
        assertThat(isMergeCommit("Add new feature")).isFalse();
        assertThat(isMergeCommit("Fix bug in auth")).isFalse();
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "merge pull request", "merged branch feature", "typo fix", "typo: fixed in README", "fix lint errors",
            "fix lint: removed unused import", "lint: run linter", "lint fix", "format code", "format: apply prettier",
            "prettier run", "prettier: format files", "eslint --fix", "eslint: configure rules", "style: fix code style",
            "style fix", "docs: update readme", "docs: add api docs", "doc: add comments", "doc: update guide",
            "readme: add installation", "readme update", "bump version to 1.0.0", "bump dependencies",
            "chore: update deps", "chore: cleanup", "update dependency lodash", "update dependencies",
            "dependabot: bump lodash", "dependabot fix", "2024-01-15 fix bug", "2024/05/20 update", "202401",
            "20240115", "wip", "WIP", "temp", "temp ",
            // additional filters
            "fix", "update", "minor", "test", "Update lodash to 4.17.21", "Bump react from 17.0.0 to 18.0.0",
            "Archive old files", "Memo: meeting notes", "Formatting", "Format only",
            // word boundaries
            "docs: README 수정", "doc update", "style: 들여쓰기", "Merge branch 'main'", "chore: deps",
            "", "   ",
    })
    void filtersMeaninglessCommits(String message) {
        assertThat(isMeaningfulCommit(message)).isFalse();
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "20231201 update", "123456789", "添加新功能", "fix: correção",
            "Add user authentication with JWT", "Fix critical security vulnerability in login",
            "Implement ML model for recommendation system", "Refactor database schema for performance",
            "Dockerize API server", "Document upload API 추가", "styled-components 도입", "linter 설정 추가",
            "formatter 도입", "Mergeable PR 상태 표시 추가", "Memoize selector results", "Archiver 모듈 추가",
    })
    void keepsMeaningfulCommits(String message) {
        assertThat(isMeaningfulCommit(message)).isTrue();
    }

    @Test
    void keepsVeryLongMessages() {
        assertThat(isMeaningfulCommit("A".repeat(1000))).isTrue();
    }

    @Test
    void treatsWordBoundaryLikeJavaScript() {
        assertThat(isMergeCommit("Mergeable PR 상태 표시 추가")).isFalse();
        assertThat(isMergeCommit("Merge branch 'main'")).isTrue();
        // JS의 \b는 ASCII 기준이라 한글 앞도 단어 경계다. Node에서 같은 결과를 확인했다.
        assertThat(isMergeCommit("merge한 내용")).isTrue();
        assertThat(isMeaningfulCommit("docs수정 반영합니다")).isFalse();
        assertThat(isMeaningfulCommit("docs_x 모듈 추가")).isTrue();
    }

    @Test
    void treatsEndAnchorAndWhitespaceLikeJavaScript() {
        // JS의 $는 끝 줄바꿈 앞에서 맞지 않는다. "wip\n"은 정규식으로는 걸러지지 않고 한 단어 규칙으로 걸러진다.
        assertThat(isMeaningfulCommit("wip\n")).isFalse();
        assertThat(isMeaningfulCommit("123456\n추가 설명")).isTrue();
        // JS의 \s는 줄바꿈 없는 공백(U+00A0)도 공백으로 본다.
        assertThat(isMeaningfulCommit("fix lint 오류 수정")).isFalse();
    }

    @Test
    void filterCommitsRemovesMergeAndMeaninglessCommitsAndKeepsObjects() {
        record Commit(String message, String sha) {
        }
        Function<Commit, String> message = Commit::message;

        assertThat(CommitFilter.filterCommits(List.<Commit>of(), message)).isEmpty();
        assertThat(CommitFilter.filterCommits(List.of(
                new Commit("Add feature A", "a"),
                new Commit("Merge pull request #123", "b"),
                new Commit("typo fix", "c"),
                new Commit("Fix bug in feature A", "d")), message))
                .containsExactly(new Commit("Add feature A", "a"), new Commit("Fix bug in feature A", "d"));
    }
}
