package org.gainratio.amlfilter.metrics.utils;

import org.junit.jupiter.api.Test;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

class TypoGeneratorTest {

    @Test
    void typoForKey() {
        String charToChange = "U";
        String[] validValues = {"H", "Y", "I", "J", "V"};
        List<String> validValuesList = Arrays.asList(validValues);
        int count = 0;
        while (count++<100) {
            String typo  = TypoGenerator.typoForKey(charToChange);
            assertTrue(validValuesList.contains(typo));
        }
    }

    @Test
    void typoForKey_full() {
        for (String charToChange : TypoGenerator.typoMap.keySet()) {
            List<String> validValuesList = TypoGenerator.typoMap.get(charToChange);
            int count = 0;
            while (count++ < 100) {
                String typo = TypoGenerator.typoForKey(charToChange);
                assertTrue(validValuesList.contains(typo));
            }
        }
    }

    @Test
    void injectTypos() {
        String origString = "P";
        String modifiedString = TypoGenerator.injectTypos(origString, 1);
        assertTrue(modifiedString.equals("L")||modifiedString.equals("O")||modifiedString.equals("0"));
    }

    @Test
    void injectTypos_2() {
        String origString = "AL";
        String[] validValues = {"QL", "WL", "SL", "XL", "ZL", "AK", "AO", "AP"};
        List<String> validValuesList = Arrays.asList(validValues);
        int count = 0;
        while (count++ < 1000) {
            String modifiedString = TypoGenerator.injectTypos(origString, 1);
            assertTrue(validValuesList.contains(modifiedString));
        }
    }

    @Test
    void injectTypo_neg() {
        String str = "ddd";
        assertEquals(str, TypoGenerator.injectTypo(str, -1));
    }

    @Test
    void injectTypo_basic() {
        String origString = "AL";
        String[] validValues = {"QL", "WL", "SL", "XL", "ZL"};
        List<String> validValuesList = Arrays.asList(validValues);
        int count = 0;
        while (count++ < 1000) {
            assertTrue(validValuesList.contains(TypoGenerator.injectTypo(origString, 0)));
        }
    }

    @Test
    void injectTypo_basic2() {
        String origString = "AL";
        String[] validValues = {"AK", "AO", "AP"};
        List<String> validValuesList = Arrays.asList(validValues);
        int count = 0;
        while (count++ < 1000) {
            assertTrue(validValuesList.contains(TypoGenerator.injectTypo(origString, 1)));
        }
    }

    @Test
    void injectTypo_space() {
        String origString = "AL AHMED";
        String modString = TypoGenerator.injectTypo(origString, 2);
        assertEquals(origString, modString);
    }

    @Test
    void doubleChars() {
        String name = "A";
        String modName = TypoGenerator.doubleChars(name, 1);
        assertEquals("AA", modName);
    }

    @Test
    void doubleChars2() {
        String origString = "ABC";
        String[] validValues = {"AABC", "ABBC", "ABCC"};
        List<String> validValuesList = Arrays.asList(validValues);
        Set<Integer> completionSet = new HashSet<>();
        int count = 0;
        while (count++ < 100) {
            String modString = TypoGenerator.doubleChars(origString, 1);
            assertTrue(validValuesList.contains(modString));
            completionSet.add(validValuesList.indexOf(modString));
        }
        assertEquals(3, completionSet.size());
    }

    @Test
    void deleteChars() {
        assertEquals("", TypoGenerator.deleteChars("A",1));
        assertEquals("", TypoGenerator.deleteChars("AB",2));
        assertEquals("", TypoGenerator.deleteChars("12345",5));

        for (int i=0; i<1000; i++) {
            assertEquals("", TypoGenerator.deleteChars("12345",5));
        }
    }
}