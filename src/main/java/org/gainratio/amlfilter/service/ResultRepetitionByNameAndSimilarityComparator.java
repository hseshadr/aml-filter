package org.gainratio.amlfilter.service;

import org.gainratio.amlfilter.model.Result;

import java.util.Comparator;


/**
 * Comparator for comparing black list name and similarity between results
 *
 * @author Harish Seshadri
 * @version $Id$
 */
public class ResultRepetitionByNameAndSimilarityComparator implements Comparator {
    private static ResultRepetitionByNameAndSimilarityComparator mResultRepetitionByBlackListNameAndSimilarityComparator;


    /**
     * Get the result repetition by black list name and similarity comparator instance
     *
     * @return The result repetition by black list name and similarity comparator instance
     */
    public static ResultRepetitionByNameAndSimilarityComparator getInstance() {
        if (null == mResultRepetitionByBlackListNameAndSimilarityComparator) {
            mResultRepetitionByBlackListNameAndSimilarityComparator = new ResultRepetitionByNameAndSimilarityComparator();
        }
        return mResultRepetitionByBlackListNameAndSimilarityComparator;
    }

    /**
     * Compare the results by uncleaned result name to remove synonym duplicate too
     *
     * @param pResult1 The first result
     * @param pResult2 The second result
     * @return The integer comparison value
     */
    public int compare(Object pResult1, Object pResult2) {
        Result result1Obj = (Result) pResult1;
        Result result2Obj = (Result) pResult2;

        String blackListName1 = result1Obj.getResultName();
        String blackListName2 = result2Obj.getResultName();

        // MTB 0ct-2008 : this improvement allows the ordering to work also on
        //			the similarity (first goes the ones with bigger similarity)
        // 			This fix solves the issue regarding the results showing an apparent
        //			similarity below the real one (arbitrary results with the same sim
        //			were chosen).
        int retVal = blackListName1.compareTo(blackListName2);
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