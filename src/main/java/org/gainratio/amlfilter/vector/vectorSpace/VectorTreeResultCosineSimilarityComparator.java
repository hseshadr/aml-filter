package org.gainratio.amlfilter.vector.vectorSpace;

import java.util.Comparator;

/**
 * Comparator for comparing vector results based on cosine values
 */
public class VectorTreeResultCosineSimilarityComparator implements Comparator {
    /**
     * Compare the vector results based on consine values
     */
    public int compare(Object pVectorResult1, Object pVectorResult2) {
        return Double.compare(((TreeResult) pVectorResult2).similarity, ((TreeResult) pVectorResult1).similarity);
    }
}