package org.gainratio.amlfilter.algorithms;

import org.gainratio.amlfilter.service.AlgorithmsService;


/**
 * Text similarity comparator which defines an abstract
 * method called getSimilarity which must be implemented.
 *
 * @author Harish Seshadri
 * @version $Id: PhoneticPairSimilarity.java,v 1.2 2007/12/15 23:29:59 sss Exp $
 */

public class PhoneticPairSimilarity extends SimilarityComparator {
    /**
     * The pair similarity component
     */
    private PairSimilarity mPairSimilarity;

    /**
     * Get the pair similarity component
     *
     * @return The pair similarity component
     */
    public PairSimilarity getPairSimilarity() {
        return mPairSimilarity;
    }

    /**
     * Set the pair similarity component
     *
     * @param pPairSimilarity The pair similarity component
     */
    public void setPairSimilarity(PairSimilarity pPairSimilarity) {
        mPairSimilarity = pPairSimilarity;
    }

    /**
     * Get the similarity
     *
     * @param pName1 The first name
     * @param pName2 The second name
     * @return The simlarity
     */
    public final float getSimilarity(String pName1, String pName2) {
        AlgorithmsService algorithmsService = getAlgorithmsService();

        pName1 = AlgorithmsService.getPhoneticStringForPairSimilarities(pName1);
        pName2 = AlgorithmsService.getPhoneticStringForPairSimilarities(pName2);

        return getPairSimilarity().getPairSimilarities(pName1, pName2);
    }
}