package org.gainratio.amlfilter.parser.general;

import org.gainratio.amlfilter.model.EntityCodeAndNames;
import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

@Disabled
class NrfParserTest {
    private static final Logger logger = LoggerFactory.getLogger(NrfParserTest.class);

    @Test

    void loadFromSmallTextFile() throws IOException {
        List<EntityCodeAndNames> entities =
                NrfParser.loadFromTextFile(
                        "/wctest10.txt", 10);
        assertTrue(entities.size()==10);
    }

    @Test
    void loadFromTextFile() throws IOException {
        final int NUM_RECORDS = 1000000;
        List<EntityCodeAndNames> entities =
                NrfParser.loadFromTextFile(
                        "/world-check1.5mlnTest.txt", NUM_RECORDS);
        assertTrue(entities.size()==NUM_RECORDS);
    }

    @Test
    void loadFromTextFileAll() throws IOException {
        final int NUM_RECORDS = 0;
        List<EntityCodeAndNames> entities =
                NrfParser.loadFromTextFile(
                        "/world-check1.5mlnTest.txt", NUM_RECORDS);
        assertTrue(entities.size()>1000000);
    }


}