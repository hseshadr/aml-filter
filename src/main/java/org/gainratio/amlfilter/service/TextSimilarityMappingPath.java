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

package org.gainratio.amlfilter.service;


/**
 * Implements the basic comparison between names at the word level.
 * What it does:
 * <li>Creates a similarity map between both names.
 * <li>Guesses the best matching between the tokens in the sim map.
 * <li>Computes the overall similarty.
 * <li>Returns the value.
 */
public final class TextSimilarityMappingPath implements Cloneable {
    public int size = 0;
    public int[] A = new int[20];
    public int[] B = new int[20];
    public float[] similarity = new float[20];
    public float totalSimilarityWeight = 0f;
    public float totalBLWeight = 0f;
    public float relativeWeightedSimilarity = 0f;

    /**
     * Clones the MappingPath into a new one.
     */
    public TextSimilarityMappingPath clone() {
        TextSimilarityMappingPath nMP = new TextSimilarityMappingPath();

        nMP.size = size;

        for (int i = 0; i < size; i++) {
            nMP.A[i] = A[i];
            nMP.B[i] = B[i];
            nMP.similarity[i] = similarity[i];
        }

        nMP.totalSimilarityWeight = totalSimilarityWeight;
        nMP.relativeWeightedSimilarity = relativeWeightedSimilarity;
        nMP.totalBLWeight = totalBLWeight;

        return nMP;
    }

    /**
     * Clones and resizes the mp array, int version.
     *
     * @param pArray
     * @return
     */
    protected int[] clone_and_resize_intArray(int[] pArray) {
        int newArraySize = pArray.length * 2;

        int[] new_array = new int[newArraySize];

        System.arraycopy(pArray, pArray.length, new_array, new_array.length, 0);

        return new_array;
    }

    /**
     * Clones and resizes the mp array, float version.
     *
     * @param pSim_array
     * @return
     */
    protected float[] clone_and_resize_floatArray(float[] pSim_array) {
        int newArraySize = pSim_array.length * 2;

        float[] new_sim_array = new float[newArraySize];

        System.arraycopy(pSim_array, pSim_array.length, new_sim_array, new_sim_array.length, 0);

        return new_sim_array;
    }

    /**
     * Clones the MappingPath into a new one and
     * checks if there is enough room for it in the array.
     * If not enough room, makes more.
     *
     * @param pMpArray
     * @param mpCount
     * @return
     */
    public TextSimilarityMappingPath[] cloneAndMakeRoomInArray(TextSimilarityMappingPath[] pMpArray, int mpCount) {
        int newMpArraySize = pMpArray.length * 2;

        TextSimilarityMappingPath[] newMpArray = null;

        // If reaching the end of the array of mapping paths, double the size
        if (pMpArray.length < (mpCount + 2)) {
            // double size
            newMpArray = new TextSimilarityMappingPath[newMpArraySize];

            // Copy the contents of it
            for (int i = 0; i < mpCount; i++) {
                newMpArray[i] = pMpArray[i];
            }
        } else {
            newMpArray = pMpArray;
        }

        // If the arrays in the current mp are getting full, resize the arrays
        if (size > A.length - 3) {
            A = clone_and_resize_intArray(A);
            B = clone_and_resize_intArray(B);
            similarity = clone_and_resize_floatArray(similarity);
        }

        // clone the mapping path (the one in use) in the specified position
        newMpArray[mpCount] = clone();

        return newMpArray;
    }

    /**
     * Returns true if the MappingPath already has that element
     * stored for the B name (the second one).
     *
     * @param valOf_A_ToCheck
     * @param startingPosition
     * @return
     */
    public int getprevious_B_PositionForTheSame_A(int valOf_A_ToCheck, int startingPosition) {
        if (startingPosition > 0) {
            for (int i = startingPosition - 1; i >= 0; i--) {
                if (A[i] == valOf_A_ToCheck) {
                    return i;
                }
            }
        }

        return -1;
    }

    /**
     * Returns the position of a target name in the array.
     *
     * @param b
     * @return
     */
    public int getBlWordUsagePosition(int b) {
        for (int i = 0; i < size - 1; i++) {
            if (B[i] == b) {
                return i;
            }

            // break the loop if we already passed the possible position of b
            // (it is ordered -ascending- in the array)
            if (B[i] > b) {
                return -1;
            }
        }

        return -1;
    }


    /**
     * Method for retrieving the best match.
     * <p>
     * This method implements a more efficient method for computing the
     * best path to the token matching, without recursiveness.
     * It replaces the deprecated one: populate
     *
     * @param mappingPaths
     * @param pMappingPathsCount
     * @param max_A_Val
     * @param max_B_Val
     * @param pSimilarityArray
     * @param pAlreadyFishedInThisRow_Column
     * @param pBlackListWeights
     * @return
     */
    public TextSimilarityMappingPath[] populateDirectly(
            TextSimilarityMappingPath[] mappingPaths,
            int pMappingPathsCount,
            int max_A_Val,
            int max_B_Val,
            float[][] pSimilarityArray,
            int pAlreadyFishedInThisRow_Column,
            float[] pBlackListWeights
    ) {

        // Determine the smallest array of tokens. We'll use the smallest to fill the path. It defines the direction.
        boolean smallerIsFirst = false;
        if (pSimilarityArray[0].length > pSimilarityArray.length) {
            smallerIsFirst = true;
        }

        // define the working sim array
        float[][] simArray = null;

        // Reverse the array if necessary. This allows us to always work in the same direction, regardless of which name is longer
        if (!smallerIsFirst) {

            int firstLen = pSimilarityArray.length;
            int secondLen = pSimilarityArray[0].length;

            // Create it reversing the coordinates
            simArray = new float[secondLen][firstLen];

            // Transpose the array
            for (int i = 0; i < firstLen; i++) {
                for (int j = 0; j < secondLen; j++) {
                    simArray[j][i] = pSimilarityArray[i][j];
                }
            }
        } else {
            // If it stays the same, just use it.
            simArray = pSimilarityArray;
        }

        // define the lengths
        int smallName_len = simArray.length;
        int bigName_len = simArray[0].length;

        // Resize the path to account for the biggest possibility
        size = 0;
        A = new int[smallName_len];
        B = new int[smallName_len];
        similarity = new float[smallName_len];

        // Define the "taken" arrays. They mark a token as "taken" = already used in a maximize match.
        boolean[] smallNamePos_Taken = new boolean[smallName_len];
        boolean[] bigNamePos_Taken = new boolean[bigName_len];

        // Reset the arrays
        for (int i = 0; i < smallName_len; i++) {
            smallNamePos_Taken[i] = false;
        }
        for (int j = 0; j < bigName_len; j++) {
            bigNamePos_Taken[j] = false;
        }


        // Starting from the smallest name, we compare each token of the small name with the others in the big name.
        // When finding the biggest match, we look from that match into the small name trying to find the best match in the other name.
        float maxValTilNow = 0f;
        int a = -1;
        int b = -1;

        // Making as many passes as tokens the smaller name has.
        for (int pass = 0; pass < smallName_len; pass++) {

            // reseting the variables
            maxValTilNow = -1f;
            a = -1;
            b = -1;

            // Small comparison pass over the big name
            for (int i = 0; i < smallName_len; i++) {
                // if the item to examine is not already taken...
                if (!smallNamePos_Taken[i]) {
                    // we look for the best match in the big name.
                    for (int j = 0; j < bigName_len; j++) {
                        // if the item to examine is not already taken...
                        if (!bigNamePos_Taken[j]) {
                            // If found a bigger match
                            if (simArray[i][j] > maxValTilNow) {
                                maxValTilNow = simArray[i][j];
                                a = i;
                                b = j;
                            }
                        }
                    }
                }
            }

            // Big name comparison over the small name
            for (int j = 0; j < bigName_len; j++) {
                // if the item to examine is not already taken...
                if (!bigNamePos_Taken[j]) {
                    // we look for the best match in the big name.
                    for (int i = 0; i < smallName_len; i++) {
                        // if the item to examine is not already taken...
                        if (!smallNamePos_Taken[i]) {
                            // If found a bigger match
                            if (simArray[i][j] > maxValTilNow) {
                                maxValTilNow = simArray[i][j];
                                a = i;
                                b = j;
                            }
                        }
                    }
                }
            }

            // Store in the mapping path what we found.
            size++;
            similarity[pass] = simArray[a][b];

            // If we reversed the output, reverse now the coordinates before returning the path. If not, just set them.
            if (smallerIsFirst) {
                A[pass] = a;
                B[pass] = b;
            } else {
                A[pass] = b;
                B[pass] = a;
            }
            // mark the positions as taken
            smallNamePos_Taken[a] = true;
            bigNamePos_Taken[b] = true;

        } // end of passes.


        return mappingPaths;
    }

    /**
     * This method joins the broken words from a name.
     *
     * @param numOfTokensInA
     * @param numOfTokensInB
     * @param pSimilarityArray
     * @param tokens1
     * @param tokens2
     * @return
     */
    public int joinWords(int numOfTokensInA, int numOfTokensInB, float[][] pSimilarityArray, String[] tokens1, String[] tokens2) {
        int pAlreadyFishedInThisRow_Column = -1;
        int previous_B_PositionForTheSame_A = -1;

        for (int b = 0; b < numOfTokensInB; b++) {

            for (int a = 0; a < numOfTokensInA; a++) {

                if (pSimilarityArray[a][b] > 0.3) {
                    // If we have more than a value already found...
                    if (size > 0) {
                        previous_B_PositionForTheSame_A = getprevious_B_PositionForTheSame_A(a, size); // to check if it is taken in the same column
                    } else {
                        previous_B_PositionForTheSame_A = -1;
                    }


                    // Case I: taken in both the column and the row
                    // ********************************************
                    if (previous_B_PositionForTheSame_A > -1 && pAlreadyFishedInThisRow_Column > -1) {

                    }
                    // Case II: if taken only in the same row
                    // ********************************************
                    else if (pAlreadyFishedInThisRow_Column > -1) {

                    } else if (previous_B_PositionForTheSame_A > -1)
                    // Case III: If taken in the same column
                    // ********************************************
                    {

                    } else
                    // Case IV: if not taken at all: continue building this branch
                    // ********************************************
                    {


                    }

                }
            }
            pAlreadyFishedInThisRow_Column = -1;  // we reset the flag to know if we found something previously in the same row
        }

        //System.out.println("");
        //System.out.print("<<<<");

        return 1;
    }

    /**
     * Deletes an item in the mapping path array.
     *
     * @param posToDelete
     */
    public void deleteItem(int posToDelete) {
        //A[posToDelete] = 99999;

        for (int i = posToDelete; i < size - 1; i++) {
            A[i] = A[i + 1];
            B[i] = B[i + 1];
            similarity[i] = similarity[i + 1];
        }
        size--;
    }

    /**
     * Convert the text similarity mapping path to a string.
     */
    public String toString() {
        StringBuilder sb = new StringBuilder();
        sb.append("size = " + size);
        sb.append("<br>\n");
        for (int i = 0; i < size; i++) {
            sb.append("[" + i + "]  A= " + A[i] + "; B= " + B[i] + "; similarity= " + similarity[i]); //+ "; weight= " + weight[i]);
            sb.append("<br>\n");
        }

        sb.append("<br>\n");
        sb.append("totalBLWeight = " + totalBLWeight);
        sb.append("<br>\n");
        sb.append("totalSimilarity = " + totalSimilarityWeight);
        sb.append("<br>\n");
        sb.append("totalNeatSimilarity = " + relativeWeightedSimilarity);
        sb.append("<br>\n");

        return sb.toString();
    }

    /**
     * Computes the total values of the comparison.
     */
    public void computeTotals(float pTotalBlWeight, float pTotalWlWeight, float[] pBlackListWeights, float[] pWhiteListWeights) {
        int totalSimilarities = 0;
        int bb = 0;
        for (int j = 0; j < size; j++) {
            bb = B[j];
            totalSimilarities += similarity[j] * (pBlackListWeights[bb] + pWhiteListWeights[A[j]]); // mappingPaths[mostRelevantPath].weight[j]
        }

        // Fill the total values of the mapping path
        // *****************************************
        totalSimilarityWeight = totalSimilarities;
        relativeWeightedSimilarity = (totalSimilarityWeight) / (pTotalBlWeight + pTotalWlWeight);
        totalBLWeight = pTotalBlWeight;
    }

}