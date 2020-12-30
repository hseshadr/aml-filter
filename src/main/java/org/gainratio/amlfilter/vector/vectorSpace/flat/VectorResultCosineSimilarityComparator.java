package org.gainratio.amlfilter.vector.vectorSpace.flat;

import java.util.Comparator;

/**
 * Comparator for comparing vector results based on cosine values
 */
public class VectorResultCosineSimilarityComparator implements Comparator<VectorResult> {
    /**
     * Compare the vector results based on cosine values descending
     */
    public int compare(VectorResult pVectorResult1, VectorResult pVectorResult2) {
        return Double.compare(pVectorResult2.similarity, pVectorResult1.similarity);
    }
}