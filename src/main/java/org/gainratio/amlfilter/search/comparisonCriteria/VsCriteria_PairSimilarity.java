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

package org.gainratio.amlfilter.search.comparisonCriteria;

import org.gainratio.amlfilter.algorithms.PairSimilarity;

import java.io.Serializable;
import java.io.UnsupportedEncodingException;
import java.nio.charset.StandardCharsets;

public class VsCriteria_PairSimilarity extends VsComparisonCriteriaHandler implements Serializable {


    /**
     *
     */
    private static final long serialVersionUID = -7533967667900845057L;
    // The instance
    private static VsCriteria_PairSimilarity mVsCriteria_PairSimilarity;
    private final PairSimilarity mPairSimilarity = new PairSimilarity();

    public VsCriteria_PairSimilarity() {
        criteriaName = "PAIR SIMILARITY";
        minSimilarityValue = 0;
        maxSimilarityValue = 1;
        setNumDimensionsFix(false);
    }

    public static VsCriteria_PairSimilarity getInstance() {
        if (null == mVsCriteria_PairSimilarity) {
            mVsCriteria_PairSimilarity = new VsCriteria_PairSimilarity();
        }

        return mVsCriteria_PairSimilarity;
    }

    @Override
    public double computeSimilarity(int[] vectorData1, int[] vectorData2) {

        double retVal = minSimilarityValue;

        return retVal;
    }


    public double computeSimilarity(byte[] vectorData1, byte[] vectorData2) throws UnsupportedEncodingException {

        double retVal = 0;

        retVal = mPairSimilarity.getSimilarity(
                new String(vectorData1, StandardCharsets.UTF_8),
                new String(vectorData2, StandardCharsets.UTF_8)
        );

        return retVal;
    }


    public int compare2doubles(double pValue1, double pValue2) {
        return Double.compare(pValue2, pValue1);
    }

}
