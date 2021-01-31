package org.gainratio.amlfilter.parser.general;

import org.gainratio.amlfilter.model.EntityCodeAndNames;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class TsvParserTest {

    @Test
    void loadFromTextSmallFile() throws IOException {
        final int NUM_LINES = 1000;
        List<EntityCodeAndNames> entList =
                TsvParser.loadFromTextFile(
                        "/royalfed1000utf16.txt", NUM_LINES);
        assertTrue(entList.size()==NUM_LINES);
    }

        @Test
    void loadFromTextSmallFileExternalPathInClassPath() throws IOException {
        final int NUM_LINES = 10000;
        List<EntityCodeAndNames> entList =
                TsvParser.loadFromTextFile(
                        "/privateroyalfed.txt", NUM_LINES);
        assertTrue(entList.size()==NUM_LINES);
    }


    @Test
    void loadFromTextBigFile() throws IOException {
        final int NUM_LINES = 1000000;
        List<EntityCodeAndNames> entList =
                TsvParser.loadFromTextFile(
                        "/privateroyalfed.txt", NUM_LINES);
        assertTrue(entList.size()==NUM_LINES);
    }

    @Test
    void loadFromTextBigFileAll() throws IOException {
        final int NUM_LINES = 0;
        List<EntityCodeAndNames> entList =
                TsvParser.loadFromTextFile(
                        "/privateroyalfed.txt", NUM_LINES);
        assertTrue(entList.size()>1000000);
    }



}