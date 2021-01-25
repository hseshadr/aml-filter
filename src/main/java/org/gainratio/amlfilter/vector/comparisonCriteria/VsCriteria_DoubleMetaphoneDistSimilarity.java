package org.gainratio.amlfilter.vector.comparisonCriteria;

import org.gainratio.amlfilter.algorithms.EditDistanceSimilarity;

import java.io.Serializable;
import java.io.UnsupportedEncodingException;
import java.nio.charset.StandardCharsets;


public class VsCriteria_DoubleMetaphoneDistSimilarity extends VsComparisonCriteriaHandler implements Serializable {
    private static final long serialVersionUID = -7533967667900845057L;
    // The instance
    private static VsCriteria_DoubleMetaphoneDistSimilarity mVsCriteria_DoubleMetaphoneDistSimilarity;
    transient EditDistanceSimilarity mEditDistSimilarity = new EditDistanceSimilarity();

    public VsCriteria_DoubleMetaphoneDistSimilarity() {
        criteriaName = "EDIT DISTANCE SIMILARITY";
        minSimilarityValue = 0;
        maxSimilarityValue = 1;
        setNumDimensionsFix(false);
    }

    public static VsCriteria_DoubleMetaphoneDistSimilarity getInstance() {
        if (null == mVsCriteria_DoubleMetaphoneDistSimilarity) {
            mVsCriteria_DoubleMetaphoneDistSimilarity = new VsCriteria_DoubleMetaphoneDistSimilarity();
        }

        return mVsCriteria_DoubleMetaphoneDistSimilarity;
    }

    @Override
    public double computeSimilarity(int[] vectorData1, int[] vectorData2) {
        double retVal = minSimilarityValue;
        return retVal;
    }


    public double computeSimilarity(byte[] vectorData1, byte[] vectorData2) throws UnsupportedEncodingException {
        double retVal = 0;
        retVal = mEditDistSimilarity.getSimilarity(
                new String(vectorData1, StandardCharsets.UTF_8),
                new String(vectorData2, StandardCharsets.UTF_8)
        );

        return retVal;
    }


    public int compare2doubles(double pValue1, double pValue2) {
        return Double.compare(pValue2, pValue1);
    }

}
