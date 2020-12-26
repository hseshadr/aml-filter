package org.gainratio.amlfilter.search.vectorSpace;

/**
 * Declares the vector dimension subset handler interface
 * This essentially transforms incoming data into a vector
 * (vector dimension subset).
 */

public abstract class VectorDimensionSubsetHandler {
    public static final byte maxValueInDimensionByte = 100;
    public static final byte minValueInDimensionByte = -100;

    public static final int maxValueInDimensionInt = 100000;
    public static final int minValueInDimensionInt = -100000;

    /**
     * Generates the vector dimension subset from the incoming data
     *
     * @return The vector dimension subset which is a vector in itself
     */
    public abstract byte[] generateVectorDimensionSubset(final byte[] mIncomingData) throws Exception;

    public abstract int[] generateVectorDimensionSubset(final int[] mIncomingData) throws Exception;

    public abstract double[] generateVectorDimensionSubset(final double[] mIncomingData) throws Exception;
}