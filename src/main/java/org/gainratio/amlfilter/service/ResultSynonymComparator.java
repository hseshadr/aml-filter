package org.gainratio.amlfilter.service;

import org.gainratio.amlfilter.model.Result;

import java.util.Comparator;


/**
 * Comparator for comparing entity codes in source
 */
public class ResultSynonymComparator implements Comparator<Result> {
    /**
     * Compare the results by uncleaned result name to remove synonym duplicate too
     */
    public int compare(Result pResult1, Result pResult2) {
        Result result1Obj = pResult1;
        Result result2Obj = pResult2;

        String entityCodeInSource1 = result1Obj.getEntityCodeInSource().trim();
        String entityCodeInSource2 = result2Obj.getEntityCodeInSource().trim();

        String uncleanedName1 = result1Obj.getResultName();
        String uncleanedName2 = result2Obj.getResultName();

        String listName1 = result1Obj.getListName();
        String listName2 = result2Obj.getListName();

        StringBuilder compToken1Buffer = new StringBuilder();
        compToken1Buffer.append(entityCodeInSource1);
        compToken1Buffer.append("_");
        compToken1Buffer.append(uncleanedName1);
        compToken1Buffer.append("_");
        compToken1Buffer.append(listName1);
        // Modif MTB 28-Oct-2008 - forces the ordering using the similarity
        // 		Math explained:
        //				1-x ... allows the right ordering (descending)
        //				(round) and (times 100000) accounts for having a limited
        //					string to append. It speeds up the comparison. It uses 5 decimals.
        compToken1Buffer.append(Math.round((1 - result1Obj.getTextSimilarity()) * 100000));

        StringBuilder compToken2Buffer = new StringBuilder();
        compToken2Buffer.append(entityCodeInSource2);
        compToken2Buffer.append("_");
        compToken2Buffer.append(uncleanedName2);
        compToken2Buffer.append("_");
        compToken2Buffer.append(listName2);
        // Modif MTB 28-Oct-2008 - forces the ordering using the similarity
        // 		Math explained:
        //				1-x ... allows the right ordering (descending)
        //				(round) and (times 100000) accounts for having a limited
        //					string to append. It speeds up the comparison. It uses 5 decimals.
        compToken2Buffer.append(Math.round((1 - result2Obj.getTextSimilarity()) * 100000));

        //System.out.println("Comparing: compToken1Buffer = " + compToken1Buffer + " to compToken2Buffer = " + compToken2Buffer);

        return compToken1Buffer.toString().compareTo(compToken2Buffer.toString());
    }
}