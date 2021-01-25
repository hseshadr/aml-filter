package org.gainratio.amlfilter.algorithms;

import org.apache.commons.text.similarity.JaroWinklerSimilarity;

public class JaroWinklerDistanceSimilarity extends SimilarityComparator {
    /**
     * Get the similarity
     *
     * @param pName1 The first name
     * @param pName2 The second name
     * @return The simlarity
     */
    public final float getSimilarity(String pName1, String pName2) {
        JaroWinklerSimilarity jaroWinklerSimilarity = new org.apache.commons.text.similarity.JaroWinklerSimilarity();
        return jaroWinklerSimilarity.apply(pName1, pName2).floatValue();
    }
}