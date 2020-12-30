package org.gainratio.amlfilter.service;

import org.gainratio.amlfilter.model.Result;

import java.util.Comparator;


/**
 * Comparator for comparing black list name and similarity between results
 */
public class ResultRepetitionByNameAndSimilarityComparator implements Comparator<Result> {

    /**
     * Compare the results by uncleaned result name to remove synonym duplicate too
     */
    public int compare(Result pResult1, Result pResult2) {
        Result result1Obj = pResult1;
        Result result2Obj = pResult2;

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