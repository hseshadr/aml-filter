/*
 * Copyright (C) 2010 AMLFilter LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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