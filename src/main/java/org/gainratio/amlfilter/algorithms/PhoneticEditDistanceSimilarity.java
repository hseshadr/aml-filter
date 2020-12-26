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

import org.apache.commons.lang3.StringUtils;
import org.gainratio.amlfilter.service.AlgorithmsService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;


/**
 * Text similarity comparator which defines an abstract
 * method called getSimilarity which must be implemented.
 *
 * @author Harish Seshadri
 * @version $Id: PhoneticEditDistanceSimilarity.java,v 1.2 2007/12/15 23:29:59 sss Exp $
 */

public class PhoneticEditDistanceSimilarity extends SimilarityComparator {
    private static final Logger logger = LoggerFactory.getLogger(PhoneticEditDistanceSimilarity.class);

    /**
     * Get the similarity
     *
     * @param pName1 The first name
     * @param pName2 The second name
     * @return The simlarity
     */
    public final float getSimilarity(String pName1, String pName2) {
        int name1Length = pName1.length();
        int name2Length = pName2.length();

        AlgorithmsService algorithmsService = getAlgorithmsService();

        pName1 = AlgorithmsService.getPhoneticString(pName1);
        pName2 = AlgorithmsService.getPhoneticString(pName2);

        float totalPossibleChanges = Math.max((float) name1Length, (float) name2Length);

        float editDistance = StringUtils.getLevenshteinDistance(pName1, pName2);


        float similarity = 1.0f - (editDistance / totalPossibleChanges);

        if (logger.isDebugEnabled()) {
            logger.debug("pName1 phonetic string: " + pName1);
            logger.debug("pName2 phonetic string: " + pName2);
            logger.debug("totalPossibleChanges: " + totalPossibleChanges);
            logger.debug("editDistance: " + editDistance);
            logger.debug("similarity: " + similarity);
        }


        return similarity;
    }
}