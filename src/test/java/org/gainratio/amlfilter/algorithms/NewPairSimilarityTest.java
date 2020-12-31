package org.gainratio.amlfilter.algorithms;

import org.gainratio.amlfilter.BaseUnitTest;
import org.junit.jupiter.api.Test;

import static org.junit.Assert.assertTrue;


class NewPairSimilarityTest extends BaseUnitTest {

    @Test
    void testPerfectMatch() {
        String text1 = "ABC DEF";
        String text2 = "DEF ABC";
        double similarity = new NewPairSimilarity().similarity(text1, text2);
        System.out.println("similarity=" + similarity);
        assertTrue(similarity == 1.0d);
    }

    @Test
    void testPartialMatch() {
        String text1 = " ABC DFF ";
        String text2 = "DEF ABC";
        double similarity = new NewPairSimilarity().similarity(text1, text2);
        assertTrue(similarity == 0.75d);
        System.out.println("similarity=" + similarity);
    }
}