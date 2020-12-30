package org.gainratio.amlfilter.service;

import org.gainratio.amlfilter.model.Result;

import java.util.Comparator;


/**
 * Comparator by entity code in source and similarity
 */
public class ResultRepetitionByEntityCodeAndSimilarityComparator implements Comparator<Result> {

    /**
     * Compare the results by entity code in source and similarity
     */
    public int compare(Result pResult1, Result pResult2) {
        Result result1Obj = pResult1;
        Result result2Obj = pResult2;

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