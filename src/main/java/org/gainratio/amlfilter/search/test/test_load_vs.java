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

package org.gainratio.amlfilter.search.test;

import org.gainratio.amlfilter.search.comparisonCriteria.*;
import org.gainratio.amlfilter.search.dataFiles.VectorLoader_tiny;
import org.gainratio.amlfilter.search.vectorSpace.TreeResult;
import org.gainratio.amlfilter.search.vectorSpace.VectorData4Tree;
import org.gainratio.amlfilter.search.vectorSpace.VectorSpace;

import java.io.BufferedWriter;
import java.io.File;
import java.io.FileWriter;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;


public class test_load_vs {

    private static final int NUMBER_OF_CLOSE_RESULTS_FOR_DENSITY_COMPUTATION = 200;
    private static final double MIN_SIMILARITY_FOR_DENSITY_COMPUTATION = 0.3f;
    private static final boolean APPLY_MARKED_VECTOR_EXCLUSIONS = true;

    private static final String baseDir = "/opt/amlfilter/data";
    private static BufferedWriter log = null;

    /**
     * @param args
     */
    public static void main(String[] args) throws Exception {

        try {
            String logName = System.currentTimeMillis() + "_"
                    + APPLY_MARKED_VECTOR_EXCLUSIONS + "_"
                    + NUMBER_OF_CLOSE_RESULTS_FOR_DENSITY_COMPUTATION + "_"
                    + Math.round(MIN_SIMILARITY_FOR_DENSITY_COMPUTATION * 100) / 100f + ".log";

            // Open the log file
            File f = new File(baseDir + logName);
            log = new BufferedWriter(new FileWriter(f));

            // Define VS
            VectorSpace vs = new VectorSpace();

            // Set the comparison criteria
            VsCriteria_PairSimilarity psComp = new VsCriteria_PairSimilarity();
            vs.setComparator(psComp);

            //
            // debug_show_comparators();
            //
            // if (true) {
            // return;
            // }

            VectorLoader_tiny.loadStringFileInVS_tiny(baseDir + "OFAC_2008_11_28.txt", vs, 1, "\t", false, 500);

            logLine(log, "# Number of elements in vs: " + vs.size());

            // Hypothesis 1 : ref vecs from notable elements are valid criteria
            // for dim building
            // Define criteria VS
            VectorSpace critVs = new VectorSpace();

            // Set the comparison criteria
            critVs.setComparator(psComp);

            // Load the initial criteria vectors
            VectorLoader_tiny.loadStringFileInVS_tiny(baseDir + "OFAC_2008_11_28.txt", critVs, 1, "\t", false, 500);

            logLine(log, "# Number of elements in critVs: "
                    + critVs.size());

            // Mark all the elements so all of them are subjected to refining
            for (int i = 0; i < critVs.size(); i++) {
                critVs.get(i).setMark();
            }

            // // Show the densities of the ref vector elements in the vs
//			 show_refVectors_densities(critVs, vs);

            // ---------------------------------------------------------------------------------------------------------------
            // Make the new reference vectors
            // ---------------------------------------------------------------------------------------------------------------
            logLine(log, "----------------------------------- REFINING ---------------------------------------------");

            critVs = refineRefVectors(critVs, vs, 20);

            // Show the densities of the ref vector elements in the vs
//			show_refVectors_densities(critVs, vs);

            // Search by cosine and by name to compare

            // Make the target name
            VectorData4Tree targetRefurbishedVector = vs.createVector("ECHEBARRIA SMARRO LERE");

            // DIRECT SEARCH ---------------------------------------
            long startTime = System.currentTimeMillis();
            List<TreeResult> results = vs.obtainSimilarResults(
                    targetRefurbishedVector, 20, 0.6f, false);
            long endTime = System.currentTimeMillis();

            // Show the direct results
            logLine(log, "# (DIRECT SEARCH USING ALGORITHMS: " + (endTime - startTime)
                    + " ms) Found " + results.size() + " results similar to "
                    + targetRefurbishedVector.getData() + ": ");
            show_results(results);


            // NEW SYSTEM SEARCH : using cosine
            // ------------------------------------------------------------
            logLine(log, "-------- DELETING NOT TRAINED VECTORS ------------");
            // Review the vectors: if not trained, delete them
            int numDeletedVectors = 0;
            for (int i = critVs.size() - 1; i > 0; i--) {
                if (critVs.get(i).isMarked()) {
                    critVs.getVectorList().remove(i);
                    numDeletedVectors++;
                }
            }
            logLine(log, " *** Deleted vectors: " + numDeletedVectors);

            // Show the relationship between the ref vectors
            show_refVectors_distance_matrix(critVs);

            // Show the densities of the ref vector elements in the vs
            show_refVectors_densities(critVs, vs);


            // Migrate the vectors to the newly defined space
            VectorSpace vsRefurbished = repositionVsAxis_String(vs, critVs);

            // Set the comparison criteria
            VsCriteria_Cosine psCos = new VsCriteria_Cosine();
            vsRefurbished.setComparator(psCos);

            // Change the bytes to the new coordinate system
            targetRefurbishedVector.setByteCoordinates(translateCoordinatesToNewSystem(
                    targetRefurbishedVector.getByteCoordinates(), critVs));

            startTime = System.currentTimeMillis();
            results = vsRefurbished.obtainSimilarResults(
                    targetRefurbishedVector, 20, 0.6f, false);
            endTime = System.currentTimeMillis();

            // Show the new results
            logLine(log, "# (COSINE: " + (endTime - startTime)
                    + " ms) Found " + results.size() + " results similar to "
                    + targetRefurbishedVector.getData() + ": ");
            show_results(results);

            // NEW SYSTEM SEARCH : using distance
            // ---------------------------------------
            // Set the comparison criteria
            VsCriteria_Distance psDis = new VsCriteria_Distance();
            vsRefurbished.setComparator(psDis);

            startTime = System.currentTimeMillis();
            results = vsRefurbished.obtainSimilarResults(
                    targetRefurbishedVector, 20, 500f, false);
            endTime = System.currentTimeMillis();

            // Show the new results
            logLine(log, "# (DISTANCE: " + (endTime - startTime)
                    + " ms) Found " + results.size() + " results similar to "
                    + targetRefurbishedVector.getData() + ": ");
            show_results(results);

            // NEW SYSTEM SEARCH : using distance NORMALIZED
            // ---------------------------------------
            // Set the comparison criteria
            VsCriteria_Distance_Normalized psDisNorm = new VsCriteria_Distance_Normalized();
            vsRefurbished.setComparator(psDisNorm);

            startTime = System.currentTimeMillis();
            results = vsRefurbished.obtainSimilarResults(
                    targetRefurbishedVector, 20, 0.6f, false);
            endTime = System.currentTimeMillis();

            // Show the new results
            logLine(log, "# (DISTANCE NORMALIZED: "
                    + (endTime - startTime) + " ms) Found " + results.size()
                    + " results similar to "
                    + targetRefurbishedVector.getData() + ": ");
            show_results(results);


            // -----------------------------------
            // --- CREATE THE REF VECTORS ---
            // -----------------------------------


        } catch (Exception e) {
            logLine(log, e.toString());
        } finally {
            if (null != log) {
                log.close();
            }
        }
    }

    /**
     * Show the results in the system (future log)
     *
     * @param results
     */
    private static void show_results(List<TreeResult> results) throws Exception {
        for (int resPos = 0; resPos < results.size(); resPos++) {
            logLine(log, "Result : " + resPos + "\t"
                    + results.get(resPos).foundVectorData.getData()
                    + "\tSim : " + results.get(resPos).similarity);
        }
    }

    private static VectorSpace repositionVsAxis_String(VectorSpace vs,
                                                       VectorSpace critVs) throws Exception {

        String stringFromVs = null;
        byte[] bytesForStringFromVs = null;
        double similarity = -1d;
        byte elByte = -1;

        for (int vsPos = 0; vsPos < vs.size(); vsPos++) {

            stringFromVs = vs.get(vsPos).getData();
            bytesForStringFromVs = stringFromVs.getBytes(StandardCharsets.UTF_8);

            vs.get(vsPos).setByteCoordinates(
                    translateCoordinatesToNewSystem(bytesForStringFromVs,
                            critVs));

        }

        return vs;
    }

    private static VectorSpace refineRefVectors(VectorSpace pReferenceVs,
                                                VectorSpace pWorldVs, int pNumPasses) throws Exception {
        boolean hasBeenTrined = false;

        // Search for vectors that are similar to the criteria ones
        for (int i = 0; i < pReferenceVs.size(); i++) {
            hasBeenTrined = false;

            for (int pass = 0; pass < pNumPasses; pass++) {

                if (pReferenceVs.get(i).isMarked()) {

                    // Clear the mark to allow future fine tuning
                    pReferenceVs.get(i).unsetMark();

                    // Make the target vector name
                    VectorData4Tree criteriaVector = pWorldVs
                            .createVector(pReferenceVs.get(i).getData());

                    // Get the results to sniff
                    List<TreeResult> similarResultsInVs = pWorldVs
                            .obtainSimilarResults(
                                    criteriaVector,
                                    NUMBER_OF_CLOSE_RESULTS_FOR_DENSITY_COMPUTATION,
                                    MIN_SIMILARITY_FOR_DENSITY_COMPUTATION,
                                    false);

                    // Compute the density of the current incoming refVector.
                    // Used as a base: no replacements made if it is already the
                    // highest.
                    double maxDensity = pWorldVs.computeAverageSimilarity(
                            criteriaVector,
                            NUMBER_OF_CLOSE_RESULTS_FOR_DENSITY_COMPUTATION,
                            MIN_SIMILARITY_FOR_DENSITY_COMPUTATION);

                    // Loop all the results looking for the densest nucleus
                    int densestPosition = -1;
                    int posInWorldList = -1;
                    double avg = 0;
                    for (int resultsPosition = 0; resultsPosition < similarResultsInVs
                            .size(); resultsPosition++) {

                        posInWorldList = similarResultsInVs
                                .get(resultsPosition).getPositionInVectorList();

                        // If this vector was already checked, skip it
                        if (!APPLY_MARKED_VECTOR_EXCLUSIONS
                                || (APPLY_MARKED_VECTOR_EXCLUSIONS && !pWorldVs
                                .get(posInWorldList).isMarked())) {

                            // Get the average position
                            avg = pWorldVs
                                    .computeAverageSimilarity(
                                            similarResultsInVs.get(
                                                    resultsPosition)
                                                    .getPositionInVectorList(),
                                            NUMBER_OF_CLOSE_RESULTS_FOR_DENSITY_COMPUTATION,
                                            MIN_SIMILARITY_FOR_DENSITY_COMPUTATION);

                            // Mark the vector in the world so it is not used
                            // again.
                            if (APPLY_MARKED_VECTOR_EXCLUSIONS) {
                                pWorldVs.get(
                                        similarResultsInVs.get(resultsPosition)
                                                .getPositionInVectorList())
                                        .setMark();
                            }

                            if (avg > maxDensity) {
                                maxDensity = avg;
                                densestPosition = similarResultsInVs.get(
                                        resultsPosition)
                                        .getPositionInVectorList();

                                // Replace the reference element with the new
                                // center
                                pReferenceVs.get(i).setByteCoordinates(
                                        pWorldVs.get(densestPosition)
                                                .getByteCoordinates());
                                pReferenceVs.get(i).setData(
                                        pWorldVs.get(densestPosition)
                                                .getData());
                                // If it is being adjusted, set the mark for
                                // future refining.
                                pReferenceVs.get(i).setMark();

                                // Identify training in this vector. This shows
                                // value to it, so it can be taken into
                                // consideration later.
                                hasBeenTrined = true;
                            }

                        }
                    }

                    logLine(log, i + "\t- PASS: " + pass + "\tPosition:"
                            + densestPosition + "\tmaxDensity: " + maxDensity
                            + "  \tName: " + pReferenceVs.get(i).getData());
                } // end of if marked
                if (!pReferenceVs.get(i).isMarked()) {
                    break;
                }
            }
            logLine(log, "----------------------------------------------------------------------");

            // when leaving, mark the ref vector if it has not been trained,
            // meaning: others are similar
            if (!hasBeenTrined) {
                pReferenceVs.get(i).setMark();
            }
        }

        return pReferenceVs;
    }

    private static void show_refVectors_densities(VectorSpace pCritVs,
                                                  VectorSpace pVs) throws Exception {
        double avgSim = 0;
        for (int i = 0; i < pCritVs.size(); i++) {
            avgSim = pVs.computeAverageSimilarity(pCritVs.get(i),
                    NUMBER_OF_CLOSE_RESULTS_FOR_DENSITY_COMPUTATION,
                    MIN_SIMILARITY_FOR_DENSITY_COMPUTATION);

            List<TreeResult> results = pVs.obtainSimilarResults(pCritVs
                            .get(i), NUMBER_OF_CLOSE_RESULTS_FOR_DENSITY_COMPUTATION,
                    MIN_SIMILARITY_FOR_DENSITY_COMPUTATION,
                    false);

            logLine(log, i + "\tAvg SIM: " + avgSim
                    + "\t- PEND refining: " + pCritVs.get(i).isMarked()
                    + "\tNum children: " + results.size() + "\t- "
                    + pCritVs.get(i).getData());
        }
    }

    private static void show_refVectors_distance_matrix(
            VectorSpace pRefVectorsVs) throws Exception {
        double distance = 0f;
        for (int i = 0; i < pRefVectorsVs.size(); i++) {
            for (int j = 0; j < pRefVectorsVs.size(); j++) {
                distance = pRefVectorsVs.getComparator().computeSimilarity(
                        pRefVectorsVs.get(i).getByteCoordinates(),
                        pRefVectorsVs.get(j).getByteCoordinates());
                distance = Math.round(distance * 1000d);
                logLine(log, "\t" + distance, false);
            }
            logLine(log, "");
        }

    }

    private static byte[] translateCoordinatesToNewSystem(
            byte[] bytesForStringFromVs, VectorSpace critVs) throws Exception {
        byte[] bytes = new byte[critVs.size()];
        double similarity = 0;
        byte elByte = -1;

        for (int i = 0; i < critVs.size(); i++) {

            similarity = critVs.getComparator().computeSimilarity(
                    bytesForStringFromVs,
                    critVs.get(i).getData().getBytes(StandardCharsets.UTF_8));

            elByte = (byte) Math.round(256d * similarity);
            bytes[i] = elByte;
        }

        return bytes;
    }

    @SuppressWarnings("unchecked")
    private static void debug_show_comparators() throws Exception {
        // debug comparators
        VsCriteria_PairSimilarity compPair = new VsCriteria_PairSimilarity();
        VsCriteria_Distance compDistance = new VsCriteria_Distance();
        VsCriteria_Cosine compCosine = new VsCriteria_Cosine();

        TreeResult res01 = new TreeResult();
        res01.setSimilarity(0.1d);
        TreeResult res05 = new TreeResult();
        res05.setSimilarity(0.5d);
        TreeResult res10 = new TreeResult();
        res10.setSimilarity(10d);
        TreeResult res50 = new TreeResult();
        res50.setSimilarity(50d);

        logLine(log, "Comparing compPair " + res01.similarity + " with "
                + res05.similarity + " RETURNS: "
                + compPair.compare(res01, res05));
        logLine(log, "Comparing compPair " + res05.similarity + " with "
                + res10.similarity + " RETURNS: "
                + compPair.compare(res05, res10));
        logLine(log, "Comparing compPair " + res50.similarity + " with "
                + res10.similarity + " RETURNS: "
                + compPair.compare(res50, res10));
        logLine(log, "Comparing compPair " + res10.similarity + " with "
                + res10.similarity + " RETURNS: "
                + compPair.compare(res10, res10));
        logLine(log, "");
        logLine(log, "Comparing compDistance " + res01.similarity
                + " with " + res05.similarity + " RETURNS: "
                + compDistance.compare(res01, res05));
        logLine(log, "Comparing compDistance " + res05.similarity
                + " with " + res10.similarity + " RETURNS: "
                + compDistance.compare(res05, res10));
        logLine(log, "Comparing compDistance " + res50.similarity
                + " with " + res10.similarity + " RETURNS: "
                + compDistance.compare(res50, res10));
        logLine(log, "Comparing compDistance " + res10.similarity
                + " with " + res10.similarity + " RETURNS: "
                + compDistance.compare(res10, res10));
        logLine(log, "");
        logLine(log, "Comparing compCosine " + res01.similarity
                + " with " + res05.similarity + " RETURNS: "
                + compCosine.compare(res01, res05));
        logLine(log, "Comparing compCosine " + res05.similarity
                + " with " + res10.similarity + " RETURNS: "
                + compCosine.compare(res05, res10));
        logLine(log, "Comparing compCosine " + res50.similarity
                + " with " + res10.similarity + " RETURNS: "
                + compCosine.compare(res50, res10));
        logLine(log, "Comparing compCosine " + res10.similarity
                + " with " + res10.similarity + " RETURNS: "
                + compCosine.compare(res10, res10));

        logLine(log, "");
        System.out
                .println("----------- INSERTION TEST -----------------------");

        List<TreeResult> vectorResultList = new ArrayList<TreeResult>();
        TreeResult vectorResult = new TreeResult();

        int insertionPoint = 999;
        TreeResult toInsertResult = null;

        vectorResultList.add(0, vectorResult);
        vectorResultList.add(0, res01);
        vectorResultList.add(0, res10);

        // PAIR
        // ***********************************************************************
        VsComparisonCriteriaHandler comparator = compPair;
        vectorResult.setSimilarity(comparator.getMinSimilarityValue());
        // result to insert
        toInsertResult = res50;
        insertionPoint = Collections.binarySearch(vectorResultList,
                toInsertResult, comparator);
        // show list
        for (int i = 0; i < vectorResultList.size(); i++) {
            logLine(log, "\t" + i + " : "
                    + vectorResultList.get(i).getSimilarity());
        }

        logLine(log, " - " + comparator.getCriteriaName()
                + " insertion point for " + toInsertResult.getSimilarity()
                + " : " + insertionPoint);

        // COS
        // ***********************************************************************
        comparator = compCosine;
        vectorResult.setSimilarity(comparator.getMinSimilarityValue());

        // result to insert
        toInsertResult = res50;
        insertionPoint = Collections.binarySearch(vectorResultList,
                toInsertResult, comparator);

        // show list
        for (int i = 0; i < vectorResultList.size(); i++) {
            logLine(log, "\t" + i + " : "
                    + vectorResultList.get(i).getSimilarity());
        }
        logLine(log, " - " + comparator.getCriteriaName()
                + " insertion point for " + toInsertResult.getSimilarity()
                + " : " + insertionPoint);

        // DISTANCE
        // ***********************************************************************
        vectorResultList.clear();
        vectorResultList.add(0, vectorResult);
        vectorResultList.add(0, res10);
        vectorResultList.add(0, res01);

        comparator = compDistance;
        vectorResult.setSimilarity(comparator.getMinSimilarityValue());

        // result to insert
        toInsertResult = res50;
        insertionPoint = Collections.binarySearch(vectorResultList,
                toInsertResult, comparator);
        // show list
        for (int i = 0; i < vectorResultList.size(); i++) {
            logLine(log, "\t" + i + " : "
                    + vectorResultList.get(i).getSimilarity());
        }

        logLine(log, " - " + comparator.getCriteriaName()
                + " insertion point for " + toInsertResult.getSimilarity()
                + " : " + insertionPoint);

        if (insertionPoint < 0) {
            insertionPoint = -insertionPoint - 1;
        }

        vectorResultList.add(insertionPoint, toInsertResult);

        // show list
        for (int i = 0; i < vectorResultList.size(); i++) {
            logLine(log, "\t" + i + " : "
                    + vectorResultList.get(i).getSimilarity());
        }
    }

    private static void logLine(BufferedWriter pBw, String pLine) throws Exception {

        pBw.write(pLine + "\n");

        if (System.currentTimeMillis() % 5 == 0) {
            pBw.flush();
        }
    }

    private static void logLine(BufferedWriter pBw, String pLine, boolean pCarriageReturnAfterLine) throws Exception {

        pBw.write(pLine);

        if (pCarriageReturnAfterLine) {
            pBw.write("\n");
        }

        if (System.currentTimeMillis() % 5 == 0) {
            pBw.flush();
        }
    }
}
