package org.gainratio.amlfilter.parser.wc;

import org.gainratio.amlfilter.model.EntityCodeAndNames;
import org.junit.jupiter.api.Test;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class WcParserTest {
    private static final Logger logger = LoggerFactory.getLogger(WcParserTest.class);

    @Test
    void loadFromSmallTextFile() throws IOException {
        List<EntityCodeAndNames> entities =
                WcParser.loadFromTextFile(
                        "/wctest10.txt", 10);
        assertTrue(entities.size()==10);
    }

    @Test
    void loadFromTextFile() throws IOException {
        List<EntityCodeAndNames> entities =
                WcParser.loadFromTextFile(
                        "/Users/marco/tul_pers/aml-filter/data/world-check1.5mlnTest.txt", 1000000);
        assertTrue(entities.size()==1000000);
    }
}