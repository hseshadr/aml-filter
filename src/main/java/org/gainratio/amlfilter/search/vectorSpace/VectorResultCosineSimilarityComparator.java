package org.gainratio.amlfilter.search.vectorSpace;

import java.util.Comparator;

/**
 * Comparator for comparing vector results based on cosine values
 *
 * @author Marco Baena
 * @version $Id: VectorResultCosineSimilarityComparator.java,v 1.4 2005/11/28 18:16:57 hseshadr Exp $
 */
public class VectorResultCosineSimilarityComparator implements Comparator {
    // TODO: merge this with the comparison criteria ?
    /*
     * The vector result cosine similaritry comparator instance
     */
    private static VectorResultCosineSimilarityComparator mVectorResultCosineSimilarityComparator;


    /**
     * Get the vector result cosine similaritry comparator singleton instance
     *
     * @return The vector result cosine similaritry comparator singleton instance
     */
    public static VectorResultCosineSimilarityComparator getInstance() {
        if (null == mVectorResultCosineSimilarityComparator) {
            mVectorResultCosineSimilarityComparator = new VectorResultCosineSimilarityComparator();
        }
        return mVectorResultCosineSimilarityComparator;
    }

    /**
     * Compare the vector results based on consine values
     *
     * @param pVectorResult1 The first vector result
     * @param pVectorResult2 The second vector result
     * @return The integer comparison value
     */
    public int compare(Object pVectorResult1, Object pVectorResult2) {
        return Double.compare(((TreeResult) pVectorResult2).similarity, ((TreeResult) pVectorResult1).similarity);
    }
}