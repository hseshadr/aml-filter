package org.gainratio.amlfilter.algorithms;

import org.gainratio.amlfilter.service.AlgorithmsService;

import java.io.Serializable;


/**
 * Text similarity comparator which defines an abstract
 * method called getSimilarity which must be implemented.
 *
 * @author Harish Seshadri
 * @version $Id: SimilarityComparator.java,v 1.2 2007/12/15 23:29:59 sss Exp $
 */

public abstract class SimilarityComparator implements Serializable {
    /*
     * The algorithms service
     */
    private AlgorithmsService mAlgorithmsService;

    /**
     * Get the algorithms service
     *
     * @return The algorithms service
     */
    public AlgorithmsService getAlgorithmsService() {
        return mAlgorithmsService;
    }

    /**
     * Set the algorithms service
     *
     * @param pAlgorithmsService The algorithms service
     */
    public void setAlgorithmsService(AlgorithmsService pAlgorithmsService) {
        mAlgorithmsService = pAlgorithmsService;
    }

    /**
     * Get the similarity
     *
     * @param pName1 The first name
     * @param pName2 The second name
     * @return The simlarity
     */
    public abstract float getSimilarity(String pName1, String pName2);
}