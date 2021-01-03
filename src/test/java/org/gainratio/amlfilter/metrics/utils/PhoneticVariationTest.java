package org.gainratio.amlfilter.metrics.utils;

import org.junit.jupiter.api.Test;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

class PhoneticVariationTest {

    @Test
    void makeVariant() {
        assertEquals("VIA", PhoneticVariation.makeVariant("BIA"));
        assertEquals("BIA", PhoneticVariation.makeVariant("VIA"));
        assertEquals("GIN", PhoneticVariation.makeVariant("JIN"));
        assertEquals("JIN", PhoneticVariation.makeVariant("GIN"));
        assertEquals("AMPO", PhoneticVariation.makeVariant("ANPO"));
        assertEquals("ANPO", PhoneticVariation.makeVariant("AMPO"));
        assertEquals("CAN", PhoneticVariation.makeVariant("KAN"));
        assertEquals("KAN", PhoneticVariation.makeVariant("CAN"));
        assertEquals("CHE", PhoneticVariation.makeVariant("TXE"));
        assertEquals("TXE", PhoneticVariation.makeVariant("CHE"));
        assertEquals("YIN", PhoneticVariation.makeVariant("LLIN"));
        assertEquals("LLIN", PhoneticVariation.makeVariant("YIN"));
        assertEquals("SEN", PhoneticVariation.makeVariant("ZEN"));
        assertEquals("ZEN", PhoneticVariation.makeVariant("SEN"));
    }

    @Test
    void makeVariant2() {
        List<String> validValuesList = new ArrayList<>();
        validValuesList.addAll(Arrays.asList(new String[] {"EL MOHD", "AL MOHD", "IL MOHD"}));

        String targetStr = "EL MOHD";
        Set<String> completionSet = new HashSet<>();
        int count = 0;
        while (count++ < 100) {
            String modStr = PhoneticVariation.makeVariant(targetStr);
            assertTrue(validValuesList.contains(modStr));
            completionSet.add(modStr);
        }
        assertEquals(2, completionSet.size());
        assertFalse(completionSet.contains(targetStr));
    }

    @Test
    void retrieveOneOfTheListPosibilities() {
        List<String> validValuesList = new ArrayList<>();
        validValuesList.addAll(Arrays.asList(new String[] {"EL", "AL", "IL"}));
        String targetStr = "EL";
        Set<String> completionSet = new HashSet<>();
        int count = 0;
        while (count++ < 100) {
            String str = PhoneticVariation.retrieveOneOfTheListPosibilities(validValuesList, targetStr);
            assertTrue(validValuesList.contains(str));
            completionSet.add(str);
        }
        assertEquals(2, completionSet.size());
        assertFalse(completionSet.contains(targetStr));
    }
}