

package org.gainratio.amlfilter.search.comparisonCriteria;

import org.gainratio.amlfilter.search.utils.VectorUtils;


public class VsCriteria_Cosine_full extends VsComparisonCriteriaHandler {

    // The instance
    private static VsCriteria_Cosine_full mVsCriteria_Cosine;

    public VsCriteria_Cosine_full() {
        criteriaName = "COSINE_FULL";
        minSimilarityValue = -1; // this is the only difference with regular cosine: it uses the full coordinates range in the vs.
        maxSimilarityValue = 1;
        setNumDimensionsFix(true);
    }

    public static VsCriteria_Cosine_full getInstance() {
        if (null == mVsCriteria_Cosine) {
            mVsCriteria_Cosine = new VsCriteria_Cosine_full();
        }

        return mVsCriteria_Cosine;
    }

    @Override
    public double computeSimilarity(int[] vectorData1, int[] vectorData2) {

        double retVal = 0;

        retVal = VectorUtils.computeCosineOfVectors(
                vectorData1,
                vectorData2,
                VectorUtils.computeVectorMagnitude(vectorData1),
                VectorUtils.computeVectorMagnitude(vectorData2)
        );

        return retVal;
    }

    /**
     * Overload for computeSimilarity. It gets also the pre-computed magnitudes. Intended for performance.
     *
     * @param vectorData1
     * @param vectorData2
     * @param vectorMag1
     * @param vectorMag2
     * @return the cosine
     */
    public double computeSimilarity(
            int[] vectorData1,
            int[] vectorData2,
            double vectorMag1,
            double vectorMag2) {

        double retVal = 0;

        retVal = VectorUtils.computeCosineOfVectors(
                vectorData1,
                vectorData2,
                vectorMag1,
                vectorMag2
        );

        return retVal;
    }


    public double computeSimilarity(byte[] vectorData1, byte[] vectorData2) {

        double retVal = 0;

        retVal = VectorUtils.computeCosineOfVectors(
                vectorData1,
                vectorData2,
                VectorUtils.computeVectorMagnitude(vectorData1),
                VectorUtils.computeVectorMagnitude(vectorData2)
        );

        return retVal;
    }

    /**
     * Overload for computeSimilarity. It gets also the pre-computed magnitudes. Intended for performance.
     *
     * @param vectorData1
     * @param vectorData2
     * @param vectorMag1
     * @param vectorMag2
     * @return the cosine
     */
    public double computeSimilarity(
            byte[] vectorData1,
            byte[] vectorData2,
            double vectorMag1,
            double vectorMag2) {

        double retVal = 0;

        retVal = VectorUtils.computeCosineOfVectors(
                vectorData1,
                vectorData2,
                vectorMag1,
                vectorMag2
        );

        return retVal;
    }


    public int compare2doubles(double pValue1, double pValue2) {
        return Double.compare(pValue2, pValue1);
    }

    public double incSim_ReduceSeparation(double pVal1, double pVal2) {

        double remainSim1 = Math.acos(pVal1);
        double remainSim2 = Math.acos(pVal2);

        double remainResult = remainSim1 + remainSim2;

        double retVal = Math.cos(remainResult);

        if (isFirstSimilarityBiggerOrEqual(retVal, getMaxSimilarityValue())) {
            retVal = getMaxSimilarityValue();
        }

        if (isFirstSimilarityBiggerOrEqual(getMinSimilarityValue(), retVal)) {
            retVal = getMinSimilarityValue();
        }

        return retVal;

    }

    public double redSim_IncreaseSeparation(double pVal1, double pVal2) {

        double remainSim1 = Math.acos(pVal1);
        double remainSim2 = Math.acos(pVal2);

        double remainResult = remainSim1 - remainSim2;

        double retVal = Math.cos(remainResult);

        if (isFirstSimilarityBiggerOrEqual(retVal, getMaxSimilarityValue())) {
            retVal = getMaxSimilarityValue();
        }

        if (isFirstSimilarityBiggerOrEqual(getMinSimilarityValue(), retVal)) {
            retVal = getMinSimilarityValue();
        }

        return retVal;

    }

}
