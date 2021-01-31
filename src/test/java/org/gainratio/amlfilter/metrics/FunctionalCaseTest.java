package org.gainratio.amlfilter.metrics;

import org.junit.jupiter.api.Test;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import static org.junit.jupiter.api.Assertions.*;

class FunctionalCaseTest {
    private static final Logger logger = LoggerFactory.getLogger(FunctionalCaseTest.class);

    @Test
    void modifyString() {
        FunctionalCase functionalCase = new FunctionalCaseTwoTypos(null);
        String name = "AAAAA BBBBB CCCCC DDDDD";
        if (functionalCase.isNameAUsableCase(name)) {
            String modName = functionalCase.modifyString("AAAAA BBBBB CCCCC DDDDD");
            logger.info(name + " --> " + modName);
        }
    }
}