

package org.gainratio.amlfilter.service;

import org.gainratio.amlfilter.model.Result;

import java.util.Comparator;


/**
 * Comparator by entity code in source and similarity
 *
 * @author Harish Seshadri
 * @version $Id$
 */
public class ResultRepetitionByEntityCodeAndSimilarityComparator implements Comparator {
    private static ResultRepetitionByEntityCodeAndSimilarityComparator mResultRepetitionByBlackListNameAndSimilarityComparator;


    /**
     * Get the result repetition by entity code in source and similarity instance
     *
     * @return The result repetition by entity code in source and similarity instance
     */
    public static ResultRepetitionByEntityCodeAndSimilarityComparator getInstance() {
        if (null == mResultRepetitionByBlackListNameAndSimilarityComparator) {
            mResultRepetitionByBlackListNameAndSimilarityComparator = new ResultRepetitionByEntityCodeAndSimilarityComparator();
        }
        return mResultRepetitionByBlackListNameAndSimilarityComparator;
    }

    /**
     * Compare the results by entity code in source and similarity
     *
     * @param pResult1 The first result
     * @param pResult2 The second result
     * @return The integer comparison value
     */
    public int compare(Object pResult1, Object pResult2) {
        Result result1Obj = (Result) pResult1;
        Result result2Obj = (Result) pResult2;

        String entityCodeInSource1 = result1Obj.getEntityCodeInSource();
        String entityCodeInSource2 = result2Obj.getEntityCodeInSource();

        // MTB 0ct-2008 : this improvement allows the ordering to work also on
        //			the similarity (first goes the ones with bigger similarity)
        // 			This fix solves the issue regarding the results showing an apparent
        //			similarity below the real one (arbitrary results with the same sim
        //			were chosen).
        int retVal = entityCodeInSource1.compareTo(entityCodeInSource2);
        if (0 == retVal) {
            if (result1Obj.getTextSimilarity() < result2Obj.getTextSimilarity()) {
                retVal = 1;
            } else if (result1Obj.getTextSimilarity() > result2Obj.getTextSimilarity()) {
                retVal = -1;
            } else {
                retVal = 0;
            }
        }

        return retVal;
    }
}