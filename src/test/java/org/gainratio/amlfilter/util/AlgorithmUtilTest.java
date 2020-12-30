package org.gainratio.amlfilter.util;

import org.apache.commons.lang3.StringUtils;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

public class AlgorithmUtilTest {
    @Test
    void testCleanString() {
        String name = "فندق الجلاء";
        String cleanedName = AlgorithmUtils.cleanString(name);
        assertNotEquals(name, cleanedName);
        assertTrue(StringUtils.isEmpty(cleanedName));
    }
}
