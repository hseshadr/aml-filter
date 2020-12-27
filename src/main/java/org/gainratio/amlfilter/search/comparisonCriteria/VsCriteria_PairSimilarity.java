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
