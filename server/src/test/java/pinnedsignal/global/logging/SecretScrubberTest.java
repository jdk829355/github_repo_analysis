package pinnedsignal.global.logging;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.api.Test;

class SecretScrubberTest {

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
            "ghp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA | [REDACTED]",
            "github_pat_A1_A1_A1_A1_A1_A1_A1_A1_A1_A1_ | [REDACTED]",
            "sk-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb | [REDACTED]",
            "Authorization: Bearer abc.def-ghi | Authorization: Bearer [REDACTED]",
            "postgresql://postgres.ref:s3cr3t@aws-0.pooler.supabase.com:5432/postgres"
                    + " | postgresql://postgres.ref:[REDACTED]@aws-0.pooler.supabase.com:5432/postgres",
    })
    void masksSecrets(String input, String expected) {
        assertThat(SecretScrubber.scrub(input)).isEqualTo(expected);
    }

    @Test
    void leavesOrdinaryTextUntouched() {
        String text = "Can't reach database server at `aws-0.pooler.supabase.com:5432`";

        assertThat(SecretScrubber.scrub(text)).isEqualTo(text);
    }
}
