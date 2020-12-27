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