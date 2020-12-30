package org.gainratio.amlfilter.vector.comparisonCriteria;

import org.gainratio.amlfilter.vector.vectorSpace.TreeResult;

import java.io.Serializable;
import java.util.Comparator;


public abstract class VsComparisonCriteriaHandler implements Serializable, Comparator {

    /**
     * The name of the criteria used to compare
     */
    public String criteriaName = "<NOT SET>";

    /**
     * The max and min for the similarities
     */
    public double minSimilarityValue = -1;
    public double maxSimilarityValue = -1;
    private boolean isNumDimensionsFix = false;

    /**
     * Computes the similarity between two vectors
     *
     * @return the similarity between two vectors
     */
    public abstract double computeSimilarity(final int[] mVectorData1, final int[] mVectorData2) throws Exception;

    public abstract double computeSimilarity(final byte[] mVectorData1, final byte[] mVectorData2) throws Exception;

    public boolean isNumDimensionsFix() {
        return isNumDimensionsFix;
    }

    public void setNumDimensionsFix(boolean isNumDimensionsFix) {
        this.isNumDimensionsFix = isNumDimensionsFix;
    }

    // The comparator from parent class. To be used for comparing similarities in the binary tree in the searches
    public int compare(Object pVector1, Object pVector2) {
        return compare2doubles(((TreeResult) pVector1).similarity, ((TreeResult) pVector2).similarity);
    }

    public boolean isFirstSimilarityBiggerOrEqual(double pValue1, double pValue2) {
        //
        int res = compare2doubles(pValue1, pValue2);

        return res <= 0;
    }

    public abstract int compare2doubles(double pValue1, double pValue2);

    public String getCriteriaName() {
        return criteriaName;
    }

    public void setCriteriaName(String criteriaName) {
        this.criteriaName = criteriaName;
    }

    public double getMinSimilarityValue() {
        return minSimilarityValue;
    }

    public void setMinSimilarityValue(double minSimilarityValue) {
        this.minSimilarityValue = minSimilarityValue;
    }

    public double getMaxSimilarityValue() {
        return maxSimilarityValue;
    }

    public void setMaxSimilarityValue(double maxSimilarityValue) {
        this.maxSimilarityValue = maxSimilarityValue;
    }

    public double incSim_ReduceSeparation(double pVal1, double pVal2) {

        double remainSim1 = getMaxSimilarityValue() - pVal1;
        double remainSim2 = getMaxSimilarityValue() - pVal2;

        double remainResult = remainSim1 + remainSim2;

        double retVal = getMaxSimilarityValue() - remainResult;

        if (isFirstSimilarityBiggerOrEqual(retVal, getMaxSimilarityValue())) {
            retVal = getMaxSimilarityValue();
        }

        if (isFirstSimilarityBiggerOrEqual(getMinSimilarityValue(), retVal)) {
            retVal = getMinSimilarityValue();
        }

        return retVal;

    }

    public double redSim_IncreaseSeparation(double pVal1, double pVal2) {

        double remainSim1 = getMaxSimilarityValue() - pVal1;
        double remainSim2 = getMaxSimilarityValue() - pVal2;

        double remainResult = remainSim1 - remainSim2;

        double retVal = getMaxSimilarityValue() - remainResult;

        if (isFirstSimilarityBiggerOrEqual(retVal, getMaxSimilarityValue())) {
            retVal = getMaxSimilarityValue();
        }

        if (isFirstSimilarityBiggerOrEqual(getMinSimilarityValue(), retVal)) {
            retVal = getMinSimilarityValue();
        }

        return retVal;

    }


    public double getHalfWayToMaximumSimilarity(double pVal1) {

        return (getMaxSimilarityValue() + pVal1) / 2d;
    }

    public double getHalfWayToMinimumSimilarity(double pVal1) {

        return (getMinSimilarityValue() + pVal1) / 2d;
    }

}
