package org.gainratio.amlfilter.service;

import org.gainratio.amlfilter.model.Result;

import java.util.Comparator;


/**
 * Comparator for comparing entity codes in source
 *
 * @author Harish Seshadri
 * @version $Id: ResultSynonymComparator.java,v 1.1 2007/01/28 07:13:33 hseshadr Exp $
 */
public class ResultSynonymComparator implements Comparator {
    /*
     * The result entity code in source comparator instance
     */
    private static ResultSynonymComparator mResultEntityCodeInSourceComparator;


    /**
     * Get the result entity code in source comparator instance
     *
     * @return The result entity code in source comparator instance
     */
    public static ResultSynonymComparator getInstance() {
        if (null == mResultEntityCodeInSourceComparator) {
            mResultEntityCodeInSourceComparator = new ResultSynonymComparator();
        }
        return mResultEntityCodeInSourceComparator;
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