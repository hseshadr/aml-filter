

package org.gainratio.amlfilter.search.comparisonCriteria;

import org.gainratio.amlfilter.search.utils.VectorUtils;

import java.io.Serializable;


public class VsCriteria_Distance_Normalized extends VsComparisonCriteriaHandler implements Serializable {

    /**
     *
     */
    private static final long serialVersionUID = 8928413082492993097L;
    /**
     *
     */
    // The instance
    private static VsCriteria_Distance_Normalized mVsCriteria_Distance;

    public VsCriteria_Distance_Normalized() {
        criteriaName = "DISTANCE_NORMALIZED";
        minSimilarityValue = 2;
        maxSimilarityValue = 0;
        setNumDimensionsFix(true);
    }

    public static VsCriteria_Distance_Normalized getInstance() {
        if (null == mVsCriteria_Distance) {
            mVsCriteria_Distance = new VsCriteria_Distance_Normalized();
        }

        return mVsCriteria_Distance;
    }

    public double computeSimilarity(int[] vectorData1, int[] vectorData2) {

        double retVal = 0;

        retVal = VectorUtils.computeDistanceOfVectors_normalized(
                vectorData1,
                vectorData2
        );

        return retVal;
    }

    public double computeSimilarity(byte[] vectorData1, byte[] vectorData2) {

        double retVal = 0;

        retVal = VectorUtils.computeDistanceOfVectors_normalized(
                vectorData1,
                vectorData2
        );

        if (retVal == Double.MAX_EXPONENT) {
            return this.getMinSimilarityValue();
        }

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


}
