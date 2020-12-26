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

import org.apache.commons.codec.language.DoubleMetaphone;
import org.gainratio.amlfilter.service.AlgorithmsService;


/**
 * Text similarity comparator which defines an abstract
 * method called getSimilarity which must be implemented.
 *
 * @author Harish Seshadri
 * @version $Id: DoubleMetaphonePairSimilarity.java,v 1.2 2007/12/15 23:29:59 sss Exp $
 */

public class DoubleMetaphonePairSimilarity extends SimilarityComparator {
    /**
     * Get the similarity
     *
     * @param pName1 The first name
     * @param pName2 The second name
     * @return The simlarity
     */
    public final float getSimilarity(String pName1, String pName2) {
        AlgorithmsService algorithmsService = getAlgorithmsService();

        DoubleMetaphone dmp = new DoubleMetaphone();
        dmp.setMaxCodeLen(100);

        if (dmp.isDoubleMetaphoneEqual(pName1, pName2)) {
            return 1.0f;
        }

        String name1Phone = dmp.doubleMetaphone(pName1);
        String name2Phone = dmp.doubleMetaphone(pName2);

        //System.out.println("Name1 Phone: " + name1Phone);
        //System.out.println("Name2 Phone: " + name2Phone);

        float similarity = algorithmsService.getPairSimilarities(name1Phone, name2Phone);

        return similarity;
    }
}