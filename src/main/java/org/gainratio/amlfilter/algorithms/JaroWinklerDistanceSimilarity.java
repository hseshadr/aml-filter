package org.gainratio.amlfilter.algorithms;

import org.apache.commons.text.similarity.JaroWinklerDistance;

public class JaroWinklerDistanceSimilarity extends SimilarityComparator {
    /**
     * Get the similarity
     *
     * @param pName1 The first name
     * @param pName2 The second name
     * @return The simlarity
     */
    public final float getSimilarity(String pName1, String pName2) {
        JaroWinklerDistance jaroWinklerDistance = new JaroWinklerDistance();
        return jaroWinklerDistance.apply(pName1, pName2).floatValue();
    }
}