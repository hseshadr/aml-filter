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

package org.gainratio.amlfilter.search.utils;

import org.gainratio.amlfilter.search.comparisonCriteria.VsComparisonCriteriaHandler;
import org.gainratio.amlfilter.search.vectorSpace.VectorData4Tree;
import org.gainratio.amlfilter.search.vectorSpace.VectorSpace;

import java.util.BitSet;
import java.util.List;

/**
 * Performs some basic computations with vectors
 *
 * @author Marco Baena
 * @version $Id: VectorUtils.java,v 1.9 2006/04/25 19:29:10 hseshadr Exp $
 */
public final class VectorUtils {
    public static int SAMPLE_SIZE = 200;

    /**
     * Computes the scalar dot product between two vectors
     *
     * @param pVector1 The first vector as an array
     * @param pVector2 The second vector as an array
     * @return The dot product between two vectors
     */
    public final static long computesDotProduct(byte[] pVector1, byte[] pVector2) throws IllegalArgumentException {
        if ((null == pVector1) || (null == pVector2)) {
            throw new IllegalArgumentException(" (computesDotProduct) Arguments cannot be null");
        }

        if (pVector1.length != pVector2.length) {
            throw new IllegalArgumentException(" (computesDotProduct) Arguments of different length are not allowed");
        }

        long result = 0;
        for (int i = 0; i < pVector1.length; i++) {
            result += ((long) pVector1[i] * (long) pVector2[i]);
        }

        return result;
    }

    public final static double computesDotProduct(int[] pVector1, int[] pVector2) throws IllegalArgumentException {
        if ((null == pVector1) || (null == pVector2)) {
            throw new IllegalArgumentException(" (computesDotProduct) Arguments cannot be null");
        }

        if (pVector1.length != pVector2.length) {
            throw new IllegalArgumentException(" (computesDotProduct) Arguments of different length are not allowed");
        }

        double result = 0;

        for (int i = 0; i < pVector1.length; i++) {
            result += ((double) pVector1[i] * (double) pVector2[i]);
        }

        return result;
    }

    public final static double computesDotProduct(double[] pVector1, double[] pVector2) throws IllegalArgumentException {
        if ((null == pVector1) || (null == pVector2)) {
            throw new IllegalArgumentException(" (computesDotProduct) Arguments cannot be null");
        }

        if (pVector1.length != pVector2.length) {
            throw new IllegalArgumentException(" (computesDotProduct) Arguments of different length are not allowed");
        }

        double result = 0;

        for (int i = 0; i < pVector1.length; i++) {
            result += pVector1[i] * pVector2[i];
        }

        return result;
    }

    /**
     * Computes the magnitude (||vector||) of the vector
     *
     * @param pVector The vector
     * @return The magnitude of the vector
     */
    public final static double computeVectorMagnitude(byte[] pVector) throws IllegalArgumentException {
        if (pVector == null) {
            throw new IllegalArgumentException("Arguments cannot be null");
        }

        double sumOfSquares = 0d;
        for (int i = 0; i < pVector.length; i++) {
            sumOfSquares += ((double) pVector[i] * (double) pVector[i]);
        }

        return Math.sqrt(sumOfSquares);
    }

    public final static double computeVectorMagnitude(int[] pVector) throws IllegalArgumentException {
        if (pVector == null) {
            throw new IllegalArgumentException("Arguments cannot be null");
        }

        double sumOfSquares = 0d;

        for (int i = 0; i < pVector.length; i++) {
            sumOfSquares += ((double) pVector[i] * (double) pVector[i]);
        }

        return Math.sqrt(sumOfSquares);
    }


    public final static double computeVectorMagnitude(double[] pVector) throws IllegalArgumentException {
        if (pVector == null) {
            throw new IllegalArgumentException("Arguments cannot be null");
        }

        double sumOfSquares = 0d;

        for (int i = 0; i < pVector.length; i++) {
            sumOfSquares += (pVector[i] * pVector[i]);
        }

        return Math.sqrt(sumOfSquares);
    }

//    public final static double[] makeVectorOutOfDimension(VectorSpace pVs, int pDimensionPosition) {
//    	double[] retVal = new double[pVs.size()];
//    	
//    	for (int i=0; i<pVs.size(); i++) {
//    		retVal[i] = pVs.get(i).getDoubles()[pDimensionPosition];
//    	}
//    	
//    	return retVal;
//    }

    /**
     * Compute the cosine of vectors
     * (pVector1 * pVector2)/(||pVector1|| * ||pVector2||)
     *
     * @param pVector1 The first vector
     * @param pVector  The second vector
     * @param The      cosine value
     */
    public final static double computeCosineOfVectors(byte[] pVector1, byte[] pVector2) throws IllegalArgumentException {
        double retVal = 0;

        retVal = VectorUtils.computeCosineOfVectors(
                pVector1,
                pVector2,
                VectorUtils.computeVectorMagnitude(pVector1),
                VectorUtils.computeVectorMagnitude(pVector2)
        );
        return retVal;
    }

    /**
     * Compute the cosine of vectors
     * (pVector1 * pVector2)/(||pVector1|| * ||pVector2||)
     *
     * @param pVector1 The first vector
     * @param pVector  The second vector
     * @param vector1  magnitude
     * @param vector2  magnitude
     *                 return The cosine value
     */
    public final static float computeCosineOfVectors(
            byte[] pVector1,
            byte[] pVector2,
            double pLen1,
            double pLen2) throws IllegalArgumentException {
        if ((null == pVector1) || (null == pVector2)) {
            throw new IllegalArgumentException(" (computeCosineOfVectors) Arguments cannot be null");
        }

        if (pVector1.length != pVector2.length) {
            throw new IllegalArgumentException(" (computeCosineOfVectors) Arguments of different length are not allowed");
        }
        //double denominator = pLen1 * pLen2;

        // Special case in witch both vectors have zero as magnitude
        // This case takes into account the situations in witch all the dimensions have zeros as values
        if (pLen1 == 0 && pLen2 == 0) {
            return 1f;
        }

        if (pLen1 == 0 || pLen2 == 0) {
            return 0f;
        } else {
            return (float) (computesDotProduct(pVector1, pVector2) / (pLen1 * pLen2));
        }
    }

    public final static float computeCosineOfVectors(int[] pVector1, int[] pVector2) throws IllegalArgumentException {
        if ((null == pVector1) || (null == pVector2)) {
            throw new IllegalArgumentException(" (computeCosineOfVectors) Arguments cannot be null");
        }

        if (pVector1.length != pVector2.length) {
            throw new IllegalArgumentException(" (computeCosineOfVectors) Arguments of different length are not allowed (" + pVector1.length + " vs " + pVector2.length + ")");
        }
        double denominator = (computeVectorMagnitude(pVector1) * computeVectorMagnitude(pVector2));
        if (denominator == 0) {
            return 0f;
        } else {
            return (float) (computesDotProduct(pVector1, pVector2) / denominator);
        }
    }

    public final static double computeCosineOfVectors(
            int[] pVector1,
            int[] pVector2,
            double pLen1,
            double pLen2) throws IllegalArgumentException {
        if ((null == pVector1) || (null == pVector2)) {
            throw new IllegalArgumentException(" (computeCosineOfVectors) Arguments cannot be null");
        }

        if (pVector1.length != pVector2.length) {
            throw new IllegalArgumentException(" (computeCosineOfVectors) Arguments of different length are not allowed (" + pVector1.length + " vs " + pVector2.length + ")");
        }
        //double denominator = pLen1 * pLen2;

        if (pLen1 == 0 || pLen2 == 0) {
            return 0f;
        } else {
            return computesDotProduct(pVector1, pVector2) / (pLen1 * pLen2);
        }
    }

    /**
     * Compute the bit similarity by getting the difference between the bit similiarities (AND)
     * and the bit differences (XOR)
     *
     * @param pBitSet1    The first bitset
     * @param pBitSet2    The second bitset
     * @param pXORBitSet  The bit set that will hold the XOR operation of the first & second bitset
     * @param pBitSetSize The bit set size
     * @return The similiarty
     */
    public final static int computeBitSimilarityOfBitVectors(BitSet pBitSet1, BitSet pBitSet2,
                                                             BitSet pXORBitset, int pBitSetSize) {
        //pANDBitset.clear();
        //pANDBitset.or(pBitSet1);
        //pANDBitset.and(pBitSet2);

        pXORBitset.clear();
        pXORBitset.or(pBitSet1);
        pXORBitset.xor(pBitSet2);

        return pBitSetSize - pXORBitset.cardinality();

        //return pANDBitset.cardinality() - pXORBitset.cardinality();
    }

    // Returns a bitset containing the values in bytes.
    // Sets 1 if the byte is greater than 0 (2, 67, 10000, 99999999999, etc.)
    public final static BitSet byteArrayToBitSetSignificantBytes(byte[] bytes) {
        BitSet bits = new BitSet();
        for (int i = 0; i < bytes.length; i++) {

//            int val = bytes[i];
            if (bytes[i] > 0) {
                bits.set(i);
            }
        }

        return bits;
    }

    public final static BitSet intArrayToBitSetSignificantBytes(int[] ints) {
        BitSet bits = new BitSet();
//        int val = 0;
        int pos = 0;

        for (int i = 0; i < ints.length; i++) {
            if (ints[i] > 0) {
                bits.set(pos);
            }
        }
        /*
        for (int i=0; i<ints.length; i++) 
        {
            val = Math.abs(ints[i]);
            pos = i * 4;
            
            if (val < -50000) 
            {
                bits.set(pos);
            }
            
            if (val < 0) 
            {
                bits.set(pos+1);
            }
            
            if (val > 0) 
            {
                bits.set(pos+2);
            }
            
            if (val > 50000) 
            {
                bits.set(pos+3);
            }            
        }
        */

        return bits;
    }


    public final static double computeDistanceOfVectors(int[] pVector1, int[] pVector2) throws IllegalArgumentException {
        if ((null == pVector1) || (null == pVector2)) {
            throw new IllegalArgumentException(" (computeDistanceOfVectors) Arguments cannot be null");
        }

        if (pVector1.length != pVector2.length) {
            throw new IllegalArgumentException(" (computeDistanceOfVectors) Arguments of different length are not allowed (" + pVector1.length + " vs " + pVector2.length + ")");
        }

        double sumOfSquares = 0d;

        for (int i = 0; i < pVector1.length; i++) {
            sumOfSquares += Math.pow(pVector1[i] - pVector2[i], 2);
        }

        return Math.sqrt(sumOfSquares);

    }

    public final static double computeDistanceOfVectors(byte[] pVector1, byte[] pVector2) throws IllegalArgumentException {
        if ((null == pVector1) || (null == pVector2)) {
            throw new IllegalArgumentException(" (computeDistanceOfVectors) Arguments cannot be null");
        }

        if (pVector1.length != pVector2.length) {
            throw new IllegalArgumentException(" (computeDistanceOfVectors) Arguments of different length are not allowed (" + pVector1.length + " vs " + pVector2.length + ")");
        }

        double sumOfSquares = 0d;
        int tempVal = 0;

        for (int i = 0; i < pVector1.length; i++) {
//            sumOfSquares += Math.pow( ((double)(pVector1[i]-pVector2[i])), 2 );
            tempVal = pVector1[i] - pVector2[i];
            sumOfSquares += tempVal * tempVal;
        }

        return Math.sqrt(sumOfSquares);

    }

    public final static double computeDistanceOfVectors_normalized(byte[] pVector1, byte[] pVector2) throws IllegalArgumentException {
        if ((null == pVector1) || (null == pVector2)) {
            throw new IllegalArgumentException(" (computeDistanceOfVectors) Arguments cannot be null");
        }

        if (pVector1.length != pVector2.length) {
            throw new IllegalArgumentException(" (computeDistanceOfVectors) Arguments of different length are not allowed (" + pVector1.length + " vs " + pVector2.length + ")");
        }

        double sumOfSquares = 0d;
        double magnitude1 = computeVectorMagnitude(pVector1);
        double magnitude2 = computeVectorMagnitude(pVector2);
        double tempVal1 = 0;
        double tempVal2 = 0;
        double tempVal3 = 0;

        if (magnitude1 == 0 || magnitude2 == 0) {
            return Double.MAX_VALUE;
        }

        for (int i = 0; i < pVector1.length; i++) {
            tempVal1 = (double) pVector1[i] / magnitude1;
            tempVal2 = (double) pVector2[i] / magnitude2;
            tempVal3 = tempVal1 - tempVal2;
            sumOfSquares += tempVal3 * tempVal3;
//            sumOfSquares += Math.pow(
//            							(double)pVector1[i]/magnitude1 - (double)pVector2[i]/magnitude2 
//            							, 2 
//            						);
        }

        return Math.sqrt(sumOfSquares);
    }

    public final static double computeDistanceOfVectors_normalized(int[] pVector1, int[] pVector2) throws IllegalArgumentException {
        if ((null == pVector1) || (null == pVector2)) {
            throw new IllegalArgumentException(" (computeDistanceOfVectors) Arguments cannot be null");
        }

        if (pVector1.length != pVector2.length) {
            throw new IllegalArgumentException(" (computeDistanceOfVectors) Arguments of different length are not allowed (" + pVector1.length + " vs " + pVector2.length + ")");
        }

        double sumOfSquares = 0d;
        double magnitude1 = computeVectorMagnitude(pVector1);
        double magnitude2 = computeVectorMagnitude(pVector2);

        for (int i = 0; i < pVector1.length; i++) {
            sumOfSquares += Math.pow(
                    (double) pVector1[i] / magnitude1 - (double) pVector2[i] / magnitude2
                    , 2
            );
        }

        return Math.sqrt(sumOfSquares);
    }

    public final static double computeDistanceOfVectors_normalized(byte[] pVector1, byte[] pVector2, double pMagnitude1) throws IllegalArgumentException {
        if ((null == pVector1) || (null == pVector2)) {
            throw new IllegalArgumentException(" (computeDistanceOfVectors) Arguments cannot be null");
        }

        if (pVector1.length != pVector2.length) {
            throw new IllegalArgumentException(" (computeDistanceOfVectors) Arguments of different length are not allowed (" + pVector1.length + " vs " + pVector2.length + ")");
        }

        double sumOfSquares = 0d;
        double magnitude2 = computeVectorMagnitude(pVector2);

        for (int i = 0; i < pVector1.length; i++) {
            sumOfSquares += Math.pow(
                    (double) pVector1[i] / pMagnitude1 - (double) pVector2[i] / magnitude2
                    , 2
            );
        }

        return Math.sqrt(sumOfSquares);
    }

    public final static double computeMinCosine(byte[][] pDataArray, int[] pResults) {
        double minCos = Double.MAX_VALUE;
        double ACCELERATOR_THRESHOLD = 0.999d;

        int dataSize = pDataArray.length;
        int alreadyProcessedCount = 0;

        // Array for skipping identical vectors
        boolean[] alreadyProcessed = new boolean[pDataArray.length];
        for (int j = 0; j < dataSize; j++) {
            alreadyProcessed[j] = false;
        }

        double cos = 0;
        for (int j = 0; j < dataSize; j++) {
            if (!alreadyProcessed[j]) {
                for (int i = j; i < dataSize; i++) {

                    cos = computeCosineOfVectors(pDataArray[i], pDataArray[j]);

                    if (cos < minCos) {
                        minCos = cos;
                        pResults[0] = i;
                        pResults[1] = j;
                    }

                    if (cos > ACCELERATOR_THRESHOLD) {
                        alreadyProcessed[i] = true;
                        alreadyProcessedCount++;
                    }
                }
            }

            if (j % 10 == 0) {
                System.out.println(j + " alreadyProcessedCount=" + alreadyProcessedCount);
            }
        }

        System.out.println("v0 = " + pResults[0]);
        System.out.println("v1 = " + pResults[1]);

        return minCos;
    }


    public final static double computeMaximumDistance(byte[][] pDataArray, int[] pResults) {
        double maxDistance = Double.MIN_VALUE;
        double ACCELERATOR_THRESHOLD = 0.01d;

        int dataSize = pDataArray.length;
        int alreadyProcessedCount = 0;

        // Array for skipping identical vectors
        boolean[] alreadyProcessed = new boolean[pDataArray.length];
        for (int j = 0; j < dataSize; j++) {
            alreadyProcessed[j] = false;
        }

        double distance = 0;
        for (int j = 0; j < dataSize; j++) {
            if (!alreadyProcessed[j]) {
                for (int i = j; i < dataSize; i++) {

                    distance = computeDistanceOfVectors(pDataArray[i], pDataArray[j]);

                    if (distance > maxDistance) {
                        maxDistance = distance;
                        pResults[0] = i;
                        pResults[1] = j;
                    }

                    if (distance < ACCELERATOR_THRESHOLD) {
                        alreadyProcessed[i] = true;
                        alreadyProcessedCount++;
                    }
                }
            }

            if (j % 10 == 0) {
                System.out.println(j + " alreadyProcessedCount=" + alreadyProcessedCount);
            }
        }

        System.out.println("v0 = " + pResults[0]);
        System.out.println("v1 = " + pResults[1]);

        return maxDistance;
    }

    public final static double computeMaximumDistance_normalized(byte[][] pDataArray, int[] pResults) {
        double maxDistance = Double.MIN_VALUE;
        // The following value is just for optimization
        double ACCELERATOR_THRESHOLD = 0.01d;

        int dataSize = pDataArray.length;
        int alreadyProcessedCount = 0;

        // Array for skipping identical vectors
        boolean[] alreadyProcessed = new boolean[pDataArray.length];
        for (int j = 0; j < dataSize; j++) {
            alreadyProcessed[j] = false;
        }

        double distance = 0;
        double magnitude1 = 0d;
        for (int j = 0; j < dataSize; j++) {

            magnitude1 = computeVectorMagnitude(pDataArray[j]);

            if (!alreadyProcessed[j]) {
                for (int i = j; i < dataSize; i++) {

                    distance = computeDistanceOfVectors_normalized(pDataArray[j], pDataArray[i], magnitude1);

                    if (distance > maxDistance) {
                        maxDistance = distance;
                        pResults[0] = i;
                        pResults[1] = j;
                    }

                    if (distance < ACCELERATOR_THRESHOLD) {
                        alreadyProcessed[i] = true;
                        alreadyProcessedCount++;
                    }
                }
            }

            if (j % 10 == 0) {
                System.out.println(j + " alreadyProcessedCount=" + alreadyProcessedCount);
            }
        }

        System.out.println("v0 = " + pResults[0]);
        System.out.println("v1 = " + pResults[1]);

        return maxDistance;
    }

    public final static double computeMaximumDistance_normalized_optimized(byte[][] pDataArray, int[] pResults) {
        double maxDistance = Double.MIN_VALUE;
        // The following value is just for optimization
        double ACCELERATOR_THRESHOLD = 0.01d;

        int dataSize = pDataArray.length;
        int numOfDimensions = pDataArray[0].length;
        int alreadyProcessedCount = 0;

        // Array for skipping identical vectors
        boolean[] alreadyProcessed = new boolean[pDataArray.length];
        for (int j = 0; j < dataSize; j++) {
            alreadyProcessed[j] = false;
        }

        int[] coodinateArray = new int[numOfDimensions * 2];
//    	int[] minCoodinateArray = new int[numOfDimensions];

        // Looking for the max and mins in the coordinates
        for (int i = 0; i < dataSize; i++) {
            for (int j = 0; j < numOfDimensions; j++) {
                if (pDataArray[i][j] > pDataArray[coodinateArray[j]][j]) {
                    coodinateArray[j] = i;
                }

                if (pDataArray[i][j] < pDataArray[coodinateArray[numOfDimensions + j]][j]) {
                    coodinateArray[numOfDimensions + j] = i;
                }
            }
        }

        // The previous found positions. Used to compare when to stop
        int previousLocalMinimum1 = -1;
        int previousLocalMinimum2 = -1;
        int localMinimum1 = -2;
        int localMinimum2 = -2;

        double magnitude1 = 0d;
        double distance = 0;
        double localMaxDistance = -1;
        int pos = 0; // position defined by the max or min
        int contadorLocal = 0;


        // Using the found positions as starters for the search: MAX
        for (int j = 0; j < numOfDimensions; j++) {

            pos = coodinateArray[j];
            localMaxDistance = -1;

            previousLocalMinimum1 = -1;
            previousLocalMinimum2 = -1;
            contadorLocal = 0;

            if (!alreadyProcessed[pos]) {

                while (
                        (
                                (previousLocalMinimum1 != localMinimum1)
                                        ||
                                        (previousLocalMinimum2 != localMinimum2)
                        )
                                &&
                                (
                                        (previousLocalMinimum1 != localMinimum2)
                                                ||
                                                (previousLocalMinimum2 != localMinimum1)
                                )
                                &&
                                (
                                        (pos != pResults[0])
                                                &&
                                                (pos != pResults[1])
                                )
                                &&
                                (
                                        !alreadyProcessed[pos]
                                )
                ) {
                    contadorLocal++;
                    System.out.println("* j = " + j + " pos=" + pos);
                    magnitude1 = computeVectorMagnitude(pDataArray[pos]);

                    previousLocalMinimum1 = localMinimum1;
                    previousLocalMinimum2 = localMinimum2;

                    for (int i = 0; i < dataSize; i++) {
                        distance = computeDistanceOfVectors_normalized(pDataArray[pos], pDataArray[i], magnitude1);

                        // calculo local
                        if (distance > localMaxDistance) {
                            localMaxDistance = distance;
                            localMinimum1 = pos;
                            localMinimum2 = i;

//			    			alreadyProcessed[pos] 	= true;
//			    			alreadyProcessed[i] 	= true;

                            // calculo general
                            if (distance > maxDistance) {
                                maxDistance = distance;
                                pResults[0] = pos;
                                pResults[1] = i;
                                System.out.println(
                                        " GGGGGG maxDistance=" + maxDistance
                                                + " pResults[0]=" + pResults[0]
                                                + " pResults[1]=" + pResults[1]);
                            }
                        }

                        if (distance < ACCELERATOR_THRESHOLD) {
                            alreadyProcessed[pos] = true;
                            alreadyProcessed[i] = true;
                            alreadyProcessedCount += 2;
                        }
                    }

                    // Asignamos la posicion de inicio de busqueda a la localizada
                    pos = localMinimum2;

//		        	}
                }
            }

        }

        System.out.println("v0 = " + pResults[0]);
        System.out.println("v1 = " + pResults[1]);

        return maxDistance;
    }


    public final static double computeAverageDistance(byte[][] pDataArray, int pStartOffset, int pLength, boolean pNormalize) {
        double retVal = -1d;
        int dataSize = pDataArray.length;

        if (pStartOffset + pLength > dataSize) {
            return Double.MIN_VALUE;
        }

        double distance = -1d;
        double partialDistanceSum = 0d;
        int count = 0;
        // Passing over all the vectors to compute the avg distance
        for (int i = pStartOffset; i < pStartOffset + pLength; i++) {
            for (int j = i + 1; j < pStartOffset + pLength; j++) {
                if (pNormalize) {
                    distance = computeDistanceOfVectors_normalized(pDataArray[i], pDataArray[j]);
                } else {
                    distance = computeDistanceOfVectors(pDataArray[i], pDataArray[j]);
                }

                partialDistanceSum += distance;
                count++;
            }
            if (i % 100 == 0) {
                System.out.println("\t" + i + " Min partialDistanceSum=" + partialDistanceSum);
            }
        }

        retVal = partialDistanceSum / (double) count;

        return retVal;
    }

    public final static double computeAverageDistance(byte[][] pDataArray, boolean pNormalize) {
        double retVal = -1d;
        int dataSize = pDataArray.length;

        // If data are big, work with a sample
        int sampleSize = SAMPLE_SIZE;
        byte[][] sample = null;
        if (dataSize > sampleSize) {
            // build a sample out of the data
            sample = Sampling.buildRandomSample(pDataArray, sampleSize);
        } else {
            sample = pDataArray;
        }

        retVal = computeAverageDistance(sample, 0, sample.length, pNormalize);

        return retVal;
    }

    public final static double computeAverageSimilarity(
            List<VectorData4Tree> pDataArray,
            int pStartOffset,
            int pLength,
            VsComparisonCriteriaHandler pComparator) throws Exception {
        double retVal = -1d;
        int dataSize = pDataArray.size();

        if (pStartOffset + pLength > dataSize) {
            return Double.MIN_VALUE;
        }

        double distance = -1d;
        double partialDistanceSum = 0d;
        int count = 0;
        // Passing over all the vectors to compute the avg distance
        for (int i = pStartOffset; i < pStartOffset + pLength; i++) {
            for (int j = i + 1; j < pStartOffset + pLength; j++) {
                distance = pComparator.computeSimilarity(
                        pDataArray.get(i).getByteCoordinates(),
                        pDataArray.get(j).getByteCoordinates());

                partialDistanceSum += distance;
                count++;
            }

        }

        retVal = partialDistanceSum / (double) count;

        return retVal;
    }

    public final static double computeAverageSimilarity(VectorSpace pVs) throws Exception {
        double retVal = -1d;
        int dataSize = pVs.size();

        // If data are big, work with a sample
        int sampleSize = SAMPLE_SIZE;
        List<VectorData4Tree> sample = null;

        if (dataSize > sampleSize) {
            // build a sample out of the data
            sample = Sampling.buildRandomSample(pVs, sampleSize, false, false);
        } else {
            sample = pVs.getVectorList();
        }

        retVal = computeAverageSimilarity(sample, 0, sample.size(), pVs.getComparator());

        return retVal;
    }

    public final static double computeAverageCosine(byte[][] pDataArray, int pStartOffset, int pLength) {
        double retVal = -1d;
        int dataSize = pDataArray.length;

        if (pStartOffset + pLength > dataSize) {
            return Double.MIN_VALUE;
        }

        double cosine = -1d;
        double partialCosineSum = 0d;
        int count = 0;
        // Passing over all the vectors to compute the avg distance
        for (int i = pStartOffset; i < pStartOffset + pLength; i++) {
            for (int j = i + 1; j < pStartOffset + pLength; j++) {
                cosine = computeCosineOfVectors(pDataArray[i], pDataArray[j]);

                partialCosineSum += cosine;
                count++;
            }
            if (i % 100 == 0) {
                System.out.println("\t" + i + " Min partialDistanceSum=" + partialCosineSum);
            }
        }

        retVal = partialCosineSum / count;

        return retVal;
    }

    /**
     * Computes the average cosine between a list of vectors
     *
     * @param pDataList
     * @param pStartOffset
     * @param pLength
     * @return
     */
    public final static double computeAverageCosine(List<byte[]> pDataList, int pStartOffset, int pLength) {
        double retVal = -1d;
        int dataSize = pDataList.size();

        if (pStartOffset + pLength > dataSize) {
            return Double.MIN_VALUE;
        }

        double cosine = -1d;
        double partialCosineSum = 0d;
        int count = 0;
        // Passing over all the vectors to compute the avg distance
        for (int i = pStartOffset; i < pStartOffset + pLength; i++) {
            for (int j = i + 1; j < pStartOffset + pLength; j++) {
                cosine = computeCosineOfVectors(pDataList.get(i), pDataList.get(j));

                partialCosineSum += cosine;
                count++;
            }
            if (i % 100 == 0) {
                System.out.println("\t" + i + " Min partialDistanceSum=" + partialCosineSum);
            }
        }

        retVal = partialCosineSum / count;

        return retVal;
    }

    /**
     * Computes the average cosine between a list of vectors
     *
     * @param pDataList
     * @param pStartOffset
     * @param pLength
     * @return
     */
    public final static double computeAverageCosine(int pRefVector, List<VectorData4Tree> pVectorDataList, int pStartOffset, int pLength) {
        double retVal = -1d;
        int dataSize = pVectorDataList.size();

        if (pStartOffset + pLength > dataSize) {
            return Double.MIN_VALUE;
        }

        double cosine = -1d;
        double partialCosineSum = 0d;
        int count = 0;
        VectorData4Tree refVectorData = pVectorDataList.get(pRefVector);
        byte[] refVector = refVectorData.getByteCoordinates();

        // Passing over all the vectors to compute the average distance
        for (int i = pStartOffset; i < pStartOffset + pLength; i++) {
            if (pRefVector != i) {
                cosine = computeCosineOfVectors(refVector, pVectorDataList.get(i).getByteCoordinates());

                partialCosineSum += cosine;
                count++;

                if (i % 100 == 0) {
                    System.out.println("\t" + i + " Min partialDistanceSum=" + partialCosineSum);
                }
            }
        }

        retVal = partialCosineSum / count;

        return retVal;
    }


    // Avg cosine
    public final static double computeAverageCosine(byte[][] pDataArray) {
        double retVal = -1d;
        int dataSize = pDataArray.length;

        // If data are big, work with a sample
        int sampleSize = SAMPLE_SIZE;
        byte[][] sample = null;
        if (dataSize > sampleSize) {
            // build a sample out of the data
            sample = Sampling.buildRandomSample(pDataArray, sampleSize);
        } else {
            sample = pDataArray;
        }

        retVal = computeAverageCosine(sample, 0, sample.length);

        return retVal;
    }

// Density
//    // Densidad
//    public final static double computeDensity_byDistance(	byte[][] pDataArray, 
//    														byte[] pCenter,
//    														double pRadius, 
//    														boolean pNormalize) {
//       	double retVal = -1d;
//    	int dataSize = pDataArray.length;
//
//    	double distance = -1d;
//    	int count = 0;
//
//    	// Passing over all the vectors
//    	for (int i=0; i<dataSize; i++) {
//    		if (pNormalize) {
//    			distance = computeDistanceOfVectors_normalized(pCenter, pDataArray[i]);
//    		} else {
//    			distance = computeDistanceOfVectors(pCenter, pDataArray[i]);
//    		}
//
//			if (distance <= pRadius) {
//				count++;
//			}
//
//			if (i % 10000 == 0) {
//					System.out.println("\t" + i + " count=" + count);
//			}
//
//    	}
//    	
//    	System.out.println("\t" + "elements = " + count);
//    	System.out.println("\t" + "volume (radius^num_dimensions) = " + (Math.pow(pRadius, pDataArray[0].length) ));
//    	retVal = count / (Math.pow(pRadius, pDataArray[0].length) );
//    	
//    	return retVal;
//    }
//
//    public final static double computeDensity_byCosine(	byte[][] pDataArray, 
//											    		byte[] pCenter,
//											    		double pLimitCosine) {
//    	double retVal = -1d;
//    	int dataSize = pDataArray.length;
//
//    	double cosine = -1d;
//    	int count = 0;
//
////  	Passing over all the vectors
//    	for (int i=0; i<dataSize; i++) {
//    		cosine = computeCosineOfVectors(pCenter, pDataArray[i]);
//
//    		if (cosine >= pLimitCosine) {
//    			count++;
//    		}
//
////    		if (i % 10000 == 0) {
////    			System.out.println("\t" + i + " count=" + count);
////    		}
//
//    	}
//
//    	double angle = Math.acos(pLimitCosine)/Math.PI/2*360;
////    	System.out.println("\t" + "elements = " + count);
////    	System.out.println("\t" + "angle (degrees) = " + angle );
//    	retVal = count / angle;
//
//    	return retVal;
//    }    


    public final static byte[] add(
            byte[] pVector1,
            byte[] pVector2) {

        byte[] retVal = new byte[pVector1.length];
        int temp = 0;

        if ((null == pVector1) || (null == pVector2)) {
            throw new IllegalArgumentException(" (add) Arguments cannot be null");
        }

        if (pVector1.length != pVector2.length) {
            throw new IllegalArgumentException(" (add) Arguments of different length are not allowed (" + pVector1.length + " vs " + pVector2.length + ")");
        }

        for (int i = 0; i < pVector1.length; i++) {
            temp = (int) pVector1[i] + (int) pVector2[i];

            if (temp < -127) {
                temp = -127;
            }

            if (temp > 127) {
                temp = 127;
            }

            retVal[i] = (byte) temp;
        }

        return retVal;
    }


}
  


