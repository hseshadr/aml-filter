package org.gainratio.amlfilter.vector.comparisonCriteria;


import org.gainratio.amlfilter.algorithms.JaroWinklerDistanceSimilarity;

import java.io.Serializable;
import java.io.UnsupportedEncodingException;
import java.nio.charset.StandardCharsets;

public class VsCriteria_JaroWinklerSimilarity extends VsComparisonCriteriaHandler implements Serializable {
    private static final long serialVersionUID = -7533967667900845057L;
    private static VsCriteria_JaroWinklerSimilarity vsCriteria_JaroWinklerSimilarity;
    private final JaroWinklerDistanceSimilarity jaroWinklerSimilarity = new JaroWinklerDistanceSimilarity();

    public VsCriteria_JaroWinklerSimilarity() {
        criteriaName = "JARO-WINKLER SIMILARITY";
        minSimilarityValue = 0;
        maxSimilarityValue = 1;
        setNumDimensionsFix(false);
    }

    public static VsCriteria_JaroWinklerSimilarity getInstance() {
        if (null == vsCriteria_JaroWinklerSimilarity) {
            vsCriteria_JaroWinklerSimilarity = new VsCriteria_JaroWinklerSimilarity();
        }

        return vsCriteria_JaroWinklerSimilarity;
    }

    @Override
    public double computeSimilarity(int[] vectorData1, int[] vectorData2) {
        double retVal = minSimilarityValue;
        return retVal;
    }


    public double computeSimilarity(byte[] vectorData1, byte[] vectorData2) throws UnsupportedEncodingException {
        double retVal = 0;
        retVal = jaroWinklerSimilarity.getSimilarity(
                new String(vectorData1, StandardCharsets.UTF_8),
                new String(vectorData2, StandardCharsets.UTF_8)
        );
        return retVal;
    }


    public int compare2doubles(double pValue1, double pValue2) {
        return Double.compare(pValue2, pValue1);
    }

}
