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

import org.gainratio.amlfilter.search.utils.VectorUtils;

public class VsCriteria_Distance extends VsComparisonCriteriaHandler {

    // The instance
    private static VsCriteria_Distance mVsCriteria_Distance;

    public VsCriteria_Distance() {
        criteriaName = "DISTANCE";
        // TODO: watch the following assignment. It assumes no distance will be bigger than it.
        minSimilarityValue = 1000d; // Double.MAX_VALUE;
        maxSimilarityValue = 0;
        setNumDimensionsFix(true);
    }

    public static VsCriteria_Distance getInstance() {
        if (null == mVsCriteria_Distance) {
            mVsCriteria_Distance = new VsCriteria_Distance();
        }

        return mVsCriteria_Distance;
    }

    public double computeSimilarity(int[] vectorData1, int[] vectorData2) {

        double retVal = 0;

        retVal = VectorUtils.computeDistanceOfVectors(
                vectorData1,
                vectorData2
        );

        return retVal;
    }

    public double computeSimilarity(byte[] vectorData1, byte[] vectorData2) {

        double retVal = 0;

        retVal = VectorUtils.computeDistanceOfVectors(
                vectorData1,
                vectorData2
        );

        return retVal;
    }


    public int compare2doubles(double pValue1, double pValue2) {
        return Double.compare(pValue1, pValue2);
    }

    public double incSim_ReduceSeparation(double pVal1, double pVal2) {

        return pVal1 + pVal2;
    }


    public double redSim_IncreaseSeparation(double pVal1, double pVal2) {

        return pVal1 - pVal2;
    }

    public boolean isFirstSimilarityBiggerOrEqual(double pValue1, double pValue2) {

        return pValue1 <= pValue2;
    }

}
