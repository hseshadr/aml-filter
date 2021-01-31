package org.gainratio.amlfilter.parser.royalfed;

import org.gainratio.amlfilter.model.EntityCodeAndNames;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class RoyalFedParserTest {

    @Test
    void loadFromTextSmallFile() throws IOException {
        final int NUM_LINES = 1000;
        List<EntityCodeAndNames> entList =
                RoyalFedParser.loadFromTextFile(
                        "/royalfed1000utf16.txt", NUM_LINES);
        assertTrue(entList.size()==NUM_LINES);
    }

    @Test
    void loadFromTextBigFile() throws IOException {
        final int NUM_LINES = 1000000;
        List<EntityCodeAndNames> entList =
                RoyalFedParser.loadFromTextFile(
                        "/Users/marco/tul_pers/aml-filter/data/raw_data_private_royal-fed.txt", NUM_LINES);
        assertTrue(entList.size()==NUM_LINES);
    }

    @Test
    // NOTE: requires lots of RAM. There are more than 1.5 million records.
    void loadFromTextBigFileAll() throws IOException {
        final int NUM_LINES = 0;
        List<EntityCodeAndNames> entList =
                RoyalFedParser.loadFromTextFile(
                        "/Users/marco/tul_pers/aml-filter/data/raw_data_private_royal-fed.txt", NUM_LINES);
        assertTrue(entList.size()>1000000);
    }


}