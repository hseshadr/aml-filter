package org.gainratio.amlfilter.vector.vectorSpace;

import java.io.Serializable;
import java.nio.charset.StandardCharsets;


/**
 * Declares the vector dimension subset handler interface
 * This transforms incoming data into a vector
 * (vector dimension subset).
 * <p>
 * This set writes the bytes as they arrive into the dimensions
 */

public class SubsetHandler_csv extends VectorDimensionSubsetHandler implements Serializable {
    private static final long serialVersionUID = 597010606348163632L;

    /**
     * Generates the vector dimension subset from the incoming data
     */
    public byte[] generateVectorDimensionSubset(final byte[] pIncomingData) throws Exception {
        String incomingString = new String(pIncomingData, StandardCharsets.UTF_8);
        String[] tokens = incomingString.split(",");
        byte[] vectorSubset = new byte[tokens.length];
        int entero = 0;
        for (int i = 0; i < tokens.length; i++) {
            entero = Integer.parseInt(tokens[i]);
            if (Math.abs(entero) > 254) {
                System.out.println("******* SubsetHandler_csv.generateVectorDimensionSubset() : element does not fit in a byte.");
                throw new Exception("******* SubsetHandler_csv.generateVectorDimensionSubset() : element does not fit in a byte.");
            }
            vectorSubset[i] = (byte) entero;
        }
        return vectorSubset;
    }

    public int[] generateVectorDimensionSubset(final int[] mIncomingData) {
        return mIncomingData; //vectorSubset;
    }

    public double[] generateVectorDimensionSubset(final double[] mIncomingData) {
        return mIncomingData;
    }

}