package org.gainratio.amlfilter.util;

import org.gainratio.amlfilter.BaseUnitTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

public class StringUtilsTest extends BaseUnitTest {
    @BeforeEach
    void init() {
        attachLogAppender();
    }

    @Test
    void testSplitDeduplicateAndOrderTokensRetuurnsCorrectResults() {
        String str = "GHK ,DEF ,GHK, ABC ,ABC";
        List<String> expectedResults = List.of("ABC", "DEF", "GHK");
        List<String> actualResults = StringUtils.splitDeduplicateAndOrderTokens(str, ",");
        assertEquals(expectedResults, actualResults);
    }
}
