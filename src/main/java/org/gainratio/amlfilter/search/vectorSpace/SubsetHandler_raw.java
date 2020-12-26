package org.gainratio.amlfilter.search.vectorSpace;

import java.io.Serializable;


/**
 * Declares the vector dimension subset handler interface
 * This transforms incoming data into a vector
 * (vector dimension subset).
 * <p>
 * This set writes the bytes as they arrive into the dimensions
 */

public class SubsetHandler_raw extends VectorDimensionSubsetHandler implements Serializable {

    private static final long serialVersionUID = 5272699642989714640L;

    /**
     * Generates the vector dimension subset from the incoming data
     */
    public byte[] generateVectorDimensionSubset(final byte[] mIncomingData) {
        return mIncomingData;
    }

    public int[] generateVectorDimensionSubset(final int[] mIncomingData) {
        return mIncomingData;
    }

    public double[] generateVectorDimensionSubset(final double[] mIncomingData) {
        return mIncomingData;
    }
}