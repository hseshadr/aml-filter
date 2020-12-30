package org.gainratio.amlfilter.vector.vectorSpace;

import org.gainratio.amlfilter.vector.comparisonCriteria.VsComparisonCriteriaHandler;
import org.gainratio.amlfilter.vector.comparisonCriteria.VsCriteria_Distance;
import org.gainratio.amlfilter.vector.utils.Sampling;
import org.gainratio.amlfilter.vector.utils.VectorSpaceMetrics;

import java.io.BufferedWriter;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;


public class Hierarchy_utils {

    private static final boolean DEBUG_INTEGRITY_CHECKS = true;
    public static boolean APPLY_MARKED_VECTOR_EXCLUSIONS = true;
    public static BufferedWriter log = null;
    public static double MIN_SIMILARITY = 10f;
    public static int NUMBER_OF_RESULTS_SURROUNDING_SEARCHES = 100;

    private static boolean areCoordinatesAllZeros(byte[] pCoordinates) {
        for (int i = 0; i < pCoordinates.length; i++) {
            if (pCoordinates[i] != 0) {
                return false;
            }
        }
        return true;
    }

    private static void assignChildrenToParents(VectorSpace pCriteriaVs, VectorSpace pVs, float pSimilarityForTheTraining) {

        VectorData child = null;
        VectorData parent = null;
        double maxDistanceToParent = 0;
        VsComparisonCriteriaHandler comparator = pCriteriaVs.getComparator();
        int numOrphanVectors = 0;
        int numAssignVectors = 0;

        // Loop all the children
        for (int i = 0; i < pVs.size(); i++) {

            // get the child
            child = pVs.get(i);

            // Search for the most similar parent
            List<TreeResult> similarResultsInVs =
                    pCriteriaVs.obtainSimilarResults(
                            child,
                            2,
                            pSimilarityForTheTraining,
                            false);

            // If close to a parent...
            if (similarResultsInVs.size() > 0) {

                // Assign the child (searched vector) to the parent....

                // get the parent
                parent = similarResultsInVs.get(0).getFoundVectorData();

                // if the parent has no vs, create one for it.
                if (null == parent.getVectorSpace()) {
                    VectorSpace childVectorSpace = new VectorSpace();
                    childVectorSpace.setComparator(comparator);
                    // Setting the maximum possible similarity: it will be expanded as we add vectors.
                    childVectorSpace.setMaxChildDistanceToRefVector((float) comparator.getMaxSimilarityValue());
                    parent.setVectorSpace(childVectorSpace);
                }

                child.setMark();
                double similarity = similarResultsInVs.get(0).getSimilarity();
                child.setDistanceToParent((float) similarity);
                // add the child to the vs of the parent
                parent.getVectorSpace().addVector(child);

                // add the reference to the parent
                child.setParentVector(parent);

                numAssignVectors++;
            } else {
                // New orphan
                numOrphanVectors++;
                pCriteriaVs.getOrphanList().add(child);
            }
        }

    }


    /**
     * Averages the coordinates of the parent vectors using the children
     */
    public static void averageParentCoordinatesUsingChildren(VectorSpace pCriteriaVs) throws Exception {

        if (pCriteriaVs.size() == 0) {
            logLine(log, "averageParentCoordinatesUsingChildren : vs is empty. No items to average.");
            return;
        }

        int numberOfCoordinates = pCriteriaVs.get(0).getByteCoordinates().length;
        double[] parentCoordinates = new double[numberOfCoordinates];
        VectorData parent = null;
//		double distanceToParent = 0;
//		double distanceAcumToParent = 0;
        byte[] childBytes = null;
        double coordinate = 0;
        VectorSpace childrenVs = null;

        // Iterating the parent vs
        for (int i = 0; i < pCriteriaVs.size(); i++) {

            parent = pCriteriaVs.get(i);
            childrenVs = parent.getVectorSpace();
//			distanceAcumToParent = 0;
            int numChildren = 0;

            // if this parent vector has a vs subordinated to it
            if (null != childrenVs) {

                numChildren = childrenVs.size();

                // Clear the subtotals
                for (int j = 0; j < numberOfCoordinates; j++) {
                    parentCoordinates[j] = 0;
                }

                // Iterating the child vs
                for (int j = 0; j < numChildren; j++) {

//					distanceToParent = parentVs.get(j).getDistanceToParent();
//					distanceAcumToParent += distanceToParent;
                    childBytes = childrenVs.get(j).getByteCoordinates();

                    for (int k = 0; k < childrenVs.get(0).getByteCoordinates().length; k++) {
                        parentCoordinates[k] += childBytes[k];
                    }
                }

                byte[] newParentCoord = new byte[parentCoordinates.length];

                // Set the bytes in the parent
                for (int k = 0; k < childrenVs.get(0).getByteCoordinates().length; k++) {
                    coordinate = parentCoordinates[k] / (double) numChildren;

                    if (coordinate > 127) {
                        logLine(log, "******** Coordinate very big for a byte: " + coordinate);
                        throw new Exception("******** Coordinate very big for a byte: " + coordinate);
                    }

                    newParentCoord[k] = (byte) coordinate;
//					parent.getByteCoordinates()[k] = (byte)coordinate;
                }

//				// Adjusting the translation vector matrix
//				byte[] previousVectorTranslator = pCriteriaVs.getCoordinatesTranslationVectorList().get(i);
//				byte[] originalCoordinates = vectorCoordByteArray_Subtract(
//																pCriteriaVs.get(i).getByteCoordinates(),
//																previousVectorTranslator);
//
//				byte[] newVectorTranslator 		= vectorCoordByteArray_Subtract(
//																newParentCoord,
//																originalCoordinates);
//				
//				pCriteriaVs.getCoordinatesTranslationVectorList().set(i, newVectorTranslator); 

                // Set the new coordinates for the parent vector
                parent.setByteCoordinates(newParentCoord);

            }

        }
    }


    public static VectorSpace cleanRefVectorWithoutChildren(VectorSpace pCriteriaVs) {

        int removedItems = 0;

        for (int i = pCriteriaVs.size() - 1; i >= 0; i--) {
            if (null == pCriteriaVs.get(i).getVectorSpace() || pCriteriaVs.get(i).getVectorSpace().getVectorList().size() == 0) {
                pCriteriaVs.getVectorList().remove(i);
                removedItems++;
            }
        }

        logLine(log, "\t\t\t... Removed " + removedItems + " items from vs. Left: " + pCriteriaVs.size());

        return pCriteriaVs;
    }

    private static void clearVsFromVectors(VectorSpace pCriteriaVs) {
        for (int i = 0; i < pCriteriaVs.size(); i++) {
            pCriteriaVs.get(i).setVectorSpace(null);
        }
    }


    public static byte[] getTranslatedCoordinatesRelativeToVs(VectorData pVectorToTranslate,
                                                              VectorSpace pCritVs) throws Exception {

        return getTranslatedCoordinatesRelativeToVs(pVectorToTranslate, pCritVs, pCritVs.getComparator());
    }


    public static byte[] getTranslatedCoordinatesRelativeToVs(
            VectorData pVectorToTranslate,
            VectorSpace pCritVs,
            VsComparisonCriteriaHandler pComparator) throws Exception {

        byte[] bytesForStringFromVs = pVectorToTranslate.getByteCoordinates();

        byte[] bytes = new byte[pCritVs.getByteArraySeedingList().size()];
        double similarity = 0;
        byte elByte = -1;

        for (int i = 0; i < pCritVs.getByteArraySeedingList().size(); i++) {

            similarity = pComparator.computeSimilarity(
                    bytesForStringFromVs,
                    pCritVs.getByteArraySeedingList().get(i));
            if (similarity < 0) {
                similarity = 0;
            }
            elByte = normalizeToByteValue(similarity, pComparator);
            bytes[i] = elByte;
        }

        return bytes;
    }

    public static byte[] getRigidCoordinates(String pString) throws Exception {

//		int numOfDimensions = CHARS_FOR_SEADING.length();
        byte[] bytes = new byte[9999999 + 0];
//		byte elByte 		= -1;
//
//		String name = pString;
//		int numInstancesOfChar = 0;
//		char targetChar = ' ';
//		for (int i = 0; i < numOfDimensions; i++) {
//			targetChar = CHARS_FOR_SEADING.charAt(i);
//			numInstancesOfChar = countCharInstancesInString(targetChar, name);
//			elByte = (byte)numInstancesOfChar;
//			bytes[i] = elByte;
//		}


        return bytes;
    }

    public static void logLine(BufferedWriter pBw, String pLine) {
        try {
            pBw.write(pLine + "\n");

            if (System.currentTimeMillis() % 16 == 0) {
                pBw.flush();
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    public static void logLine(BufferedWriter pBw, String pLine, boolean pCarriageReturnAfterLine) {
        try {
            pBw.write(pLine);

            if (pCarriageReturnAfterLine) {
                pBw.write("\n");
            }

            if (System.currentTimeMillis() % 16 == 0) {
                pBw.flush();
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }


    public static void moveOrphans(VectorSpace pFromVs, VectorSpace pToVs) {

        pToVs.getOrphanList().addAll(pFromVs.getOrphanList());
        pFromVs.getOrphanList().clear();
    }


    /**
     * Normalizes the passed value to byte.
     * TODO: this method should be in the comparator object so each comparator knows how to efficeintly normalize.
     */
    public static byte normalizeToByteValue(double pValue, VsComparisonCriteriaHandler pComparator) throws Exception {
        byte retVal = 0;
        double valueToReturn = 0;
        double maxCompValue = pComparator.getMaxSimilarityValue();
        double minCompValue = pComparator.getMinSimilarityValue();

//		System.out.print("\t\t\t* Sim = " + pValue);

        // If the comparator allows similarity values that are small...
        if (Math.abs(maxCompValue - minCompValue) <= 1000d) {
            valueToReturn = Math.round(127d * (pValue - minCompValue) / (maxCompValue - minCompValue));
        } else {
            // If the max value is big, we return it as is. This could create an exception if the value exceeds the byte boundaries.
            valueToReturn = Math.round(pValue);
        }

        // Using the complement on the dimension
//		valueToReturn = 127d - valueToReturn;

        // Check to see if the return val is bigger than the actual byte (avoids overflow)
        if (valueToReturn > 127d || valueToReturn < 0d) {
            logLine(log, "normalizeToByteValue: Overflow in byte conversion. Trying to put: " + valueToReturn + " into a byte.");
            throw new Exception("normalizeToByteValue: Overflow in byte conversion. Trying to put: " + valueToReturn + " into a byte.");
        }

        retVal = (byte) valueToReturn;
//		retVal = (byte)((int)retVal*2-127); // test on using the full range of values

//		System.out.println("\t\t\t* Sim Norm. = " + retVal);

        return retVal;
    }

    public static void recomputeVectorListCoordinates_RelativeToVs(
            VectorSpace pCritVs,
            List<VectorData> pListToReposition,
            VsComparisonCriteriaHandler pComparator) throws Exception {

        VectorSpace childVs = null;

        for (int vsPos = 0; vsPos < pListToReposition.size(); vsPos++) {
            VectorData vectorToReposition = pListToReposition.get(vsPos);

            translateCoordinatesForNewSystem(vectorToReposition, pCritVs, pComparator);

            // DEBUG: Verify coordinates
            if (areCoordinatesAllZeros(vectorToReposition.getByteCoordinates())) {
                System.out.println("COORDINATES ARE EMPTY (" + vsPos + "/" + pListToReposition.size() + ") : " + vectorToReposition.getData());
            }

            // Take care of the possible tree
            childVs = vectorToReposition.getVectorSpace();
            if (null != childVs) {
                recomputeVectorListCoordinates_RelativeToVs(pCritVs, childVs.getVectorList(), pComparator);
            }

        }
    }

    public static VectorSpace recomputeVsCoordinates(VectorSpace pCritVs) throws Exception {

        // Recompute the coordinates of the whole tree
        recomputeVsCoordinates_RelativeToVs(pCritVs, pCritVs);

        // recompute the coordinates of the orphans (not in the tree)
        recomputeVectorListCoordinates_RelativeToVs(pCritVs, pCritVs.getOrphanList(), pCritVs.getComparator());


        return pCritVs;
    }


    /**
     * Recomputes the axis of the children using the new reference vectors.
     */
    public static void recomputeVsCoordinates_RelativeToVs(VectorSpace pCritVs, VectorSpace pVsToReposition) throws Exception {

        VectorSpace childVs = null;

        for (int vsPos = 0; vsPos < pVsToReposition.size(); vsPos++) {
            VectorData vectorToReposition = pVsToReposition.get(vsPos);

            translateCoordinatesForNewSystem(vectorToReposition, pCritVs, pCritVs.getComparator());

            // DEBUG: Verify coordinates
            if (areCoordinatesAllZeros(vectorToReposition.getByteCoordinates())) {
                System.out.println("COORDINATES ARE EMPTY for (" + vsPos + "/" + pVsToReposition.size() + ") : " + vectorToReposition.getData());
            }

            // Take care of the possible tree
            childVs = vectorToReposition.getVectorSpace();
            if (null != childVs) {
                recomputeVsCoordinates_RelativeToVs(pCritVs, childVs);
            }

        }
    }


    private static VectorSpace refineRefVectors(VectorSpace pReferenceVs,
                                                VectorSpace pRawVs,
                                                int pNumPasses,
                                                float pRefineSimilarity,
                                                int pMaxSizeForVsRefineSampling) throws Exception {

        float refineSimilarity = pRefineSimilarity;
        int incRefiningPasses = 6;

        // Mark the elements in ref vs:
        // ----------------------------
        //	- marked ones will be refined (when refined the mark is set again)
        pReferenceVs.markAllVectorsInList();

        // Perform the indicated number of passes
        for (int pass = 0; pass < pNumPasses; pass++) {

            // adjust the refineSimilarity
            refineSimilarity = pRefineSimilarity;
            if (pass < incRefiningPasses) {
                for (int k = incRefiningPasses - pass; k > 0; k--) {
                    refineSimilarity = (float) pReferenceVs.getComparator().getHalfWayToMaximumSimilarity(refineSimilarity);
                }
            }

            // In each pass we work on a sample of the vs. This avoids long time in the training
            // Note: if a bigger number that the vs itself is provided, the whole vs is processed
            // NOTE: if we are in the last iteration, we consider the whole vs
            VectorSpace vsSubset = null;

            if (pMaxSizeForVsRefineSampling > pRawVs.size() * 0.7d || (pass + 1) * pMaxSizeForVsRefineSampling > pRawVs.size() * 0.5) {
                vsSubset = pRawVs;
            } else {
                vsSubset = Sampling.buildClonedRandomSample(pRawVs,
                        pMaxSizeForVsRefineSampling,
                        false,
                        false);
            }

            logLine(log, "\t- PASS: " + pass + "----------------------------------------------------------------------");

            // Search for vectors that are similar to the criteria ones
            for (int i = 0; i < pReferenceVs.size(); i++) {

                // Act only on marked vectors
                // --------------------------
                if (pReferenceVs.get(i).isMarked()) {

//					// Clear the mark to allow exit without the mark if not trained
                    // only do it after the first passes
                    if (pass > incRefiningPasses) {
                        pReferenceVs.get(i).unsetMark();
                    }

                    // Make the target vector
                    // TODO: (PERFORMANCE) get this assignament out of the if block and replace the references to .get for this object.
                    VectorData criteriaVector = pReferenceVs.get(i);

                    // Get the results to sniff
                    // ----------------------------------------------------
                    List<TreeResult> similarResultsInVs = vsSubset
                            .obtainSimilarResults(
                                    criteriaVector,
                                    NUMBER_OF_RESULTS_SURROUNDING_SEARCHES,
                                    refineSimilarity,
                                    true);

                    // Compute the density of the current incoming refVector.
                    // Used as a base: no replacements made if it is already the
                    // highest.
                    double maxDensity = vsSubset.computeDensityAround(
                            criteriaVector,
                            refineSimilarity);

                    // Loop all the results looking for the densest nucleus
                    int densestPosition = -1;
                    int resultPositionInWorldList = -1;
                    double avg = 0;
                    for (int resultsPosition = 0; resultsPosition < similarResultsInVs.size(); resultsPosition++) {

                        resultPositionInWorldList = similarResultsInVs.get(resultsPosition).getPositionInVectorList();
                        VectorData possibleNewCenter = similarResultsInVs.get(resultsPosition).getFoundVectorData();

                        // If this vector was already checked, skip it
                        if (!APPLY_MARKED_VECTOR_EXCLUSIONS || (APPLY_MARKED_VECTOR_EXCLUSIONS && possibleNewCenter.isMarked())) {

                            // Unmark the vector in the world so it is not used again.
                            if (APPLY_MARKED_VECTOR_EXCLUSIONS) {
                                possibleNewCenter.unsetMark();
                            }

                            avg = vsSubset.computeDensityAround(
                                    similarResultsInVs.get(resultsPosition).getFoundVectorData(),
                                    refineSimilarity);

                            // If the density is bigger than previous
                            // TODO: use the comparator !!!!!!!!!!!!
                            if (avg > maxDensity) {
                                maxDensity = avg;
                                densestPosition = resultPositionInWorldList;

                                // Replace the reference element with the new center
                                VectorData newCenter = possibleNewCenter.clone();
                                newCenter.setVectorSpace(null);
                                pReferenceVs.getVectorList().set(i, newCenter);
                                // Since it is being adjusted, set the mark of the ref vector for future refining.
                                // Note: if it is not marked, it will be ignored next iteration, for performance ("already checked and nothing better found").
                                pReferenceVs.get(i).setMark();

                            }

                        }
                    }

                    logLine(log, "\tVector:\t" + i + "\t densestPosition:"
                            + densestPosition + "\tmaxDensity: " + maxDensity
                            + "  \tName: " + pReferenceVs.get(i).getData());
                } // end of if marked

            }

        }

        return pReferenceVs;
    }

    private static VectorSpace repositionVsAxis_String(VectorSpace pVsToReposition, VectorSpace pCritVs) throws Exception {

        String stringFromVs = null;
        byte[] bytesForStringFromVs = null;

        for (int vsPos = 0; vsPos < pVsToReposition.size(); vsPos++) {

            stringFromVs = pVsToReposition.get(vsPos).getData();
            bytesForStringFromVs = stringFromVs.getBytes(StandardCharsets.UTF_8);

            pVsToReposition.get(vsPos).setByteCoordinates(
                    translateCoordinatesToNewSystem(bytesForStringFromVs, pCritVs)
            );

        }

        return pVsToReposition;
    }

    public static void show_refVectors_densities(VectorSpace pCritVs, VectorSpace pVs) throws Exception {
        double avgSim = 0;
        for (int i = 0; i < pCritVs.size(); i++) {
            avgSim = pVs.computeAverageSimilarity(pCritVs.get(i),
                    NUMBER_OF_RESULTS_SURROUNDING_SEARCHES,
                    MIN_SIMILARITY);

            List<TreeResult> results = pVs.obtainSimilarResults(pCritVs
                            .get(i), NUMBER_OF_RESULTS_SURROUNDING_SEARCHES,
                    MIN_SIMILARITY,
                    false);

            logLine(log, i + "\tAvg SIM: " + avgSim
                    + "\t- PEND refining: " + pCritVs.get(i).isMarked()
                    + "\tNum children: " + results.size() + "\t- "
                    + pCritVs.get(i).getData());
        }
    }

    private static void show_refVectors_distance_matrix(VectorSpace pRefVectorsVs) throws Exception {
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

    public static void show_translationVectors(VectorSpace pHierarchicalVs) throws Exception {

        logLine(log, "#### Showing the translation matrix");

        for (int vPos = 0; vPos < pHierarchicalVs.size(); vPos++) {
            logLine(log, "\t- Translator for: " + vPos + " ... ", false);
            for (int i = 0; i < pHierarchicalVs.getCoordinatesTranslationVectorList().get(vPos).length; i++) {
                logLine(log, "," + pHierarchicalVs.getCoordinatesTranslationVectorList().get(vPos)[i], false);
            }
            logLine(log, "");
        }
    }

    public static void testAllChildrenPointToParent(VectorData pParent) throws Exception {

        VectorSpace parentVs = pParent.getVectorSpace();

        if (parentVs != null) {
            for (int i = 0; i < parentVs.size(); i++) {
                // test it
                if (!parentVs.get(i).getParentVector().equals(pParent)) {
                    throw new Exception("*** Error in tree. Found child that has a wrong ref to its parent." +
                            "\t parent: " + pParent.getData() +
                            "\t child: " + parentVs.get(i).getData());
                }

                // recursive test drilling down
                if (parentVs.get(i).getVectorSpace() != null) {
                    testAllChildrenPointToParent(parentVs.get(i));
                }
            }
        }
    }

    public static void translateCoordinatesForNewSystem(
            VectorData pVectorToTranslate,
            VectorSpace pCritVs,
            VsComparisonCriteriaHandler pComparator) throws Exception {
        byte[] byteCoordinates = getTranslatedCoordinatesRelativeToVs(pVectorToTranslate, pCritVs, pComparator);
        pVectorToTranslate.setByteCoordinates(byteCoordinates);
    }

    private static byte[] translateCoordinatesToNewSystem(byte[] pBytesForStringFromVs, VectorSpace pCritVs) throws Exception {
        byte[] bytes = new byte[pCritVs.size()];
        double similarity = 0;
        byte elByte = -1;

        for (int i = 0; i < pCritVs.size(); i++) {

            similarity = pCritVs.getComparator().computeSimilarity(
                    pBytesForStringFromVs,
                    pCritVs.get(i).getData().getBytes(StandardCharsets.UTF_8));

            elByte = (byte) Math.round(256d * similarity);
            bytes[i] = elByte;
        }

        return bytes;
    }

    /**
     * Adds two byte arrays
     */
    public static byte[] vectorCoordByteArray_Add(byte[] pVector1, byte[] pVector2) throws Exception {
        byte[] retVal = new byte[pVector1.length];

        byte[] v1 = null;
        byte[] v2 = null;


        if (pVector1.length > pVector2.length) {
            v1 = pVector1;
            v2 = pVector2;
        } else {
            v1 = pVector2;
            v2 = pVector1;
        }

        int sum = 0;

        for (int i = 0; i < v1.length; i++) {
            if (i > v2.length) {
                sum = v1[i];
            } else {
                sum = v1[i] + v2[i];

                if (sum > 127 || sum < -128) {
                    throw new Exception("vectorCoordByteArray_Add : byte return value is bigger than 127 (value: " + sum + ") ");
                }
            }

            retVal[i] = (byte) sum;
        }

        return retVal;
    }

    /**
     * Subtracts two byte arrays
     */
    public static byte[] vectorCoordByteArray_Subtract(byte[] pVector1, byte[] pVector2) throws Exception {
        byte[] retVal = new byte[pVector1.length];

        byte[] v1 = null;
        byte[] v2 = null;
        int v1Sign;
        int v2Sign;

        if (pVector1.length > pVector2.length) {
            v1 = pVector1;
            v2 = pVector2;
            v1Sign = 1;
            v2Sign = -1;
        } else {
            v1 = pVector2;
            v2 = pVector1;
            v1Sign = -1;
            v2Sign = 1;
        }

        int difference = 0;

        for (int i = 0; i < v1.length; i++) {
            if (i > v2.length - 1) {
                difference = v1Sign * v1[i];
            } else {
                difference = v1Sign * v1[i] + v2Sign * v2[i];

                if (difference > 127 || difference < -128) {
                    throw new Exception("vectorCoordByteArray_Subtract : return value overflows byte value (value: " + difference + ") ");
                }
            }

            retVal[i] = (byte) difference;
        }

        return retVal;
    }


//	private boolean addVectorcitoToTree_old(
//									VectorData pVectorToAdd, 
//									VectorSpace pOrderedVs, 
//									VectorSpace pRawVs,
//									float pTrainSimilarity) {
//		boolean retVal = false;
////		double minSimilarityAllowed = (pOrderedVs.getComparator().getMinSimilarityValue() + pOrderedVs.getComparator().getMaxSimilarityValue()) / 2d;
//		float minSimilarityAllowed	= pTrainSimilarity;
//		float  simWithParent 		= -1f;
//		VectorData mostSimilarParent = null;
//		
//		// Compare parents in this layer
//		List<VqSearchResult> simVectorsInThisLayer = pOrderedVs.obtainSimilarResults(
//																				pVectorToAdd, 
//																				2, 
//																				minSimilarityAllowed );
//
//		// Case 1 : SIMILAR PARENT found
//		// -----------------------------
//		if (!simVectorsInThisLayer.isEmpty()) {
//			logLine(log, "#Case 1 : SIMILAR PARENT found");
//			// Choose the most similar one
//			mostSimilarParent 	= simVectorsInThisLayer.get(0).getFoundVectorData();
//			simWithParent 		= (float)simVectorsInThisLayer.get(0).getSimilarity();
//			
//			// If the parent has no children, compute the density in the space, aiming the most centered one
//			if ( (null == mostSimilarParent.getVectorSpace()) || (0 == mostSimilarParent.getVectorSpace().size()) ) {
//				// Case 1.1 : SIMILAR-PARENT -> parent has NO CHILDREN
//				// ---------------------------------------------------
//				logLine(log, "#Case 1.1 : SIMILAR-PARENT -> parent has NO CHILDREN");
//				
//				// Decide if descent
//				if (!decideDescent(pVectorToAdd, mostSimilarParent, pOrderedVs, simWithParent, pTrainSimilarity)) {
//
//					// Case 1.1.1 : SIMILAR-PARENT -> parent has NO CHILDREN -> CHILD STAYS
//					// --------------------------------------------------------------------
//					logLine(log, "#Case 1.1.1 : SIMILAR-PARENT -> parent has NO CHILDREN -> CHILD STAYS");
//					// Add the vector as a BROTHER of this parent (it had none)
//					pOrderedVs.addVector( pVectorToAdd, mostSimilarParent.getParentVector() );
//					retVal = true;
//
//				} else {
//					// Case 1.1.2 : SIMILAR-PARENT -> parent has NO CHILDREN -> DESCENT CHILD
//					// ----------------------------------------------------------------------
//					logLine(log, "#Case 1.1.2 : SIMILAR-PARENT -> parent has NO CHILDREN -> DESCENT CHILD");
//					
//
//					// SIMILAR-PARENT -> parent has NO CHILDREN -> DESCENT CHILD -> INCOMING vector is MORE CENTERED
//					// ---------------------------------------------------------------------------------------------
//					// Make the PARENT vector a child of itself (descending it. It only existed in the upper layer.)
//					logLine(log, "# (cloning parent in the lower level)");
//					pOrderedVs.addChild(mostSimilarParent, mostSimilarParent.clone());
//					
//					if (pRawVs.isFirstVectorMoreCentered(
//															pVectorToAdd, 
//															mostSimilarParent, 
//															NUMBER_OF_CLOSE_RESULTS_FOR_DENSITY_COMPUTATION, 
//															minSimilarityAllowed) ) {
//
//						// Replace the parent data with the data from this vector
//						mostSimilarParent.copy(pVectorToAdd);
//						
//						// recompute children distances to parent since parent changed
//						// ...
//					}
//
//					// Add the vector as a CHILD of this parent
//					pOrderedVs.addChild(mostSimilarParent, pVectorToAdd);
//					retVal = true;
//				}
//
//			} else {
//			// Case 1.2: SIMILAR-PARENT -> parent WITH CHILDREN
//			// ------------------------------------------------
//				logLine(log, "#Case 1.2: SIMILAR-PARENT -> parent WITH CHILDREN");
//				// Decide if descent
//				if (decideDescent(pVectorToAdd, mostSimilarParent, pOrderedVs, simWithParent, pTrainSimilarity)) {
//					// Case 1.2.1: SIMILAR-PARENT -> parent WITH CHILDREN -> DESCEND
//					// -------------------------------------------------------------
//					logLine(log, "#Case 1.2.1: SIMILAR-PARENT -> parent WITH CHILDREN -> DESCEND");
//					// Get the child vs
//					VectorSpace childVs = mostSimilarParent.getVectorSpace();
//
//					// SIMILAR-PARENT -> parent WITH CHILDREN -> local DENSITY of incoming BIGGER than PARENT'S
//					// ----------------------------------------------------------------------------------------
//					if (childVs.isFirstVectorMoreCentered(
//														pVectorToAdd,
//														mostSimilarParent,
//														NUMBER_OF_CLOSE_RESULTS_FOR_DENSITY_COMPUTATION,
//														minSimilarityAllowed)) {
//						
//						// Replace the parent with a clone of this vector
//						mostSimilarParent.copy(pVectorToAdd);
//						
//						// recompute children distances to parent since parent changed.
//						//...
//					}
//					
//					// Go down the tree. Call this same method on the children vs.
//					retVal = addVectorcitoToTree_old(pVectorToAdd, childVs, pRawVs, pTrainSimilarity); // TODO: review this similarity.
//				} else {
//					// Case 1.2.2: SIMILAR-PARENT -> parent WITH CHILDREN -> no descend, add BROTHER
//					// -----------------------------------------------------------------------------
//					logLine(log, "#Case 1.2.2: SIMILAR-PARENT -> parent WITH CHILDREN -> no descend, add BROTHER");
//					// Add the vector as a BROTHER of this parent (it had none)
//					pOrderedVs.addVector( pVectorToAdd, mostSimilarParent.getParentVector());
//					retVal = true;
//				}
//			}
//
//
//		} else {
//		// Case 2 : NO SIMILAR parent found
//		// --------------------------------
//			logLine(log, "#Case 2 : NO SIMILAR parent found");
//			// Add it as a brother (to be placed at level of the others)
//			pOrderedVs.addVector( pVectorToAdd );
//
//			retVal = true;
//		}
//		
//		// recompute distances to parents, going up in the tree.
//		if (retVal) {
//			
//		}
//		
//		return retVal;
//	}
//

    private static List<byte[]> createSeedingByteArrayListForPairSim_withSpaces(int pSizeOfStrings) throws Exception {
        List<byte[]> retList = new ArrayList<byte[]>();
        String validChars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        String combinedCharsInPairs = "";
        String space = " ";
        int currentSizeOfString = 0;

        for (int i = 0; i < validChars.length(); i++) {
            for (int j = 0; j < validChars.length(); j++) {
                combinedCharsInPairs = combinedCharsInPairs.concat(validChars.substring(i, i + 1)).concat(validChars.substring(j, j + 1)).concat(space);
                currentSizeOfString += 3;

                // checking if ready to create a new vector
                if (currentSizeOfString > pSizeOfStrings) {
                    retList.add(combinedCharsInPairs.getBytes(StandardCharsets.UTF_8));
                    currentSizeOfString = 0;
                    combinedCharsInPairs = "";
                }
            }
        }

        if (currentSizeOfString > 0) {
            retList.add(combinedCharsInPairs.getBytes(StandardCharsets.UTF_8));
        }

        return retList;
    }

    private static List<byte[]> createSeedingByteArrayListForPairSim(int pNumberOfStrings) throws Exception {
        List<byte[]> retList = new ArrayList<byte[]>();
        String validChars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        String combinedCharsInPairs = "";

        for (int i = 0; i < validChars.length(); i++) {
            for (int j = 0; j < validChars.length(); j++) {
                combinedCharsInPairs = combinedCharsInPairs.concat(validChars.substring(i, i + 1)).concat(validChars.substring(j, j + 1));
            }
            retList.add(combinedCharsInPairs.getBytes(StandardCharsets.UTF_8));
            combinedCharsInPairs = "";
        }


        return retList;
    }

    private boolean addVectorcitoToTree_old(
            VectorData pVectorToAdd,
            VectorSpace pOrderedVs,
            VectorSpace pRawVs,
            double pTrainSimilarity,
            int pMaxNumPeripheralVectors) {

        boolean parentWasAChild = false;
        boolean replaceParentWithNewVector = false;

        boolean retVal = false;
        double trainingSimilarityForNextLayer = pOrderedVs.getComparator().getHalfWayToMaximumSimilarity(pTrainSimilarity);
        double simWithParent = -1f;
        VectorData mostSimilarParent = null;

        VectorSpace childVs = null;

//		Compare parents in this layer
        List<TreeResult> simVectorsInThisLayer = pOrderedVs.obtainSimilarResults(
                pVectorToAdd,
                2,
                pTrainSimilarity,
                false);

//		Case 1 : SIMILAR PARENT found
//		-----------------------------
        if (!simVectorsInThisLayer.isEmpty()) {
//			Choose the most similar one
            mostSimilarParent = simVectorsInThisLayer.get(0).getFoundVectorData();
            simWithParent = simVectorsInThisLayer.get(0).getSimilarity();
            logLine(log, "#Case 1 : SIMILAR PARENT found (sim=" + simWithParent + ") (trainingSimilarityForNextLayer = " + trainingSimilarityForNextLayer + ")");

            if (decideDescent(
                    pVectorToAdd,
                    mostSimilarParent,
                    pOrderedVs,
                    simWithParent,
                    pTrainSimilarity,
                    trainingSimilarityForNextLayer,
                    pMaxNumPeripheralVectors)) {

                logLine(log, "#Case 1.1 : SIMILAR-PARENT -> DESCENT CHILD");

                // if the parent has no vs
                if (mostSimilarParent.getVectorSpace() == null) {
                    parentWasAChild = true;
                } else {
                    childVs = mostSimilarParent.getVectorSpace();
                }

                if (parentWasAChild) {
                    // check to see if incoming vector is more centered than parent. On the open raw vs
                    if (pRawVs.isFirstVectorMoreCentered( // TODO: review the density function !!!
                            pVectorToAdd,
                            mostSimilarParent,
                            NUMBER_OF_RESULTS_SURROUNDING_SEARCHES,
                            pTrainSimilarity)) {
                        replaceParentWithNewVector = true;
                    }
                } else {
                    // check to see if incoming vector is more centered than parent. on the child vs
                    if (childVs.isFirstVectorMoreCentered( // TODO: review the density function !!!
                            pVectorToAdd,
                            mostSimilarParent,
                            NUMBER_OF_RESULTS_SURROUNDING_SEARCHES,
                            pTrainSimilarity)) {
                        replaceParentWithNewVector = true;
                    }
                }


                if (parentWasAChild) {
                    // Make the PARENT vector a child of itself
                    logLine(log, "# (cloning parent in the lower level)");
                    // adds child allowing the trainingSimilarityForNextLayer in the new vs to be set.
                    pOrderedVs.addChild(
                            mostSimilarParent,
                            mostSimilarParent.clone(),
                            trainingSimilarityForNextLayer);
                }

                if (replaceParentWithNewVector) {
                    // Replace the parent data with the data from this vector
                    mostSimilarParent.copy(pVectorToAdd);

                    // recompute children distances to parent since parent changed
                    // ...

                    // recompute distance of parent to grandparent
                    // ...
                }

                if (parentWasAChild) {
                    // Add the vector as a CHILD of this parent
                    pOrderedVs.addChild(
                            mostSimilarParent,
                            pVectorToAdd);

                    //
                    if (!replaceParentWithNewVector) {
                        // Check if peripheral to increase the counter
                        if (pOrderedVs.getComparator().isFirstSimilarityBiggerOrEqual(trainingSimilarityForNextLayer, simWithParent)) {
                            pOrderedVs.incNumberOfPeripheralVectors();
                        }
                    }

                    retVal = true;

                } else {
                    // go down to the underlying vs trying to add the vector there
                    retVal = addVectorcitoToTree_old(
                            pVectorToAdd,
                            childVs,
                            pRawVs,
                            trainingSimilarityForNextLayer,
                            pMaxNumPeripheralVectors);
                }


            } else {
                logLine(log, "#Case 1.2: SIMILAR-PARENT -> no descend, add BROTHER");
                // Add the vector as a BROTHER of this parent
                pOrderedVs.addVector(
                        pVectorToAdd,
                        mostSimilarParent.getParentVector());

                // Check if peripheral to increase the counter
                if (pOrderedVs.getComparator().isFirstSimilarityBiggerOrEqual(trainingSimilarityForNextLayer, simWithParent)) {
                    pOrderedVs.incNumberOfPeripheralVectors();
                }

                retVal = true;
            }

        } else {
            // Case 2 : DO NOT DESCEND
            // --------------------------------
            logLine(log, "#Case 2 : NO SIMILAR parent found");
            // Add it as a brother (to be placed at level of the others)
            pOrderedVs.addVector(pVectorToAdd);

            pOrderedVs.incNumberOfPeripheralVectors();

            retVal = true;
        }

        System.out.println("\t## peripherals = " + pOrderedVs.getNumberOfPeripheralVectors());
        return retVal;
    }

    private boolean decideDescent(
            VectorData pVectorToAdd,
            VectorData pSimilarParent,
            VectorSpace pOrderedVs,
            double pSimWithParent,
            double pTrainSimilarity,
            double pTrainSimilarityForNextLayer,
            int pMaxNumPeripheralVectors) {

        System.out.println("\t ... " + pVectorToAdd.getData());

        VsComparisonCriteriaHandler comparator = pOrderedVs.getComparator();

        double maxSimInThisSpace = pOrderedVs.getComparator().getMaxSimilarityValue();

        // Case 1 :  Do not descend if similarity is maximum
        if (pSimWithParent == maxSimInThisSpace) {
            return true;
        }

        // Case 2 :  Descend if similarity is high, over the sim for next layer (TODO: overwrite previous for efficiency)
        if (comparator.isFirstSimilarityBiggerOrEqual(pSimWithParent, pTrainSimilarityForNextLayer)) {
            return true;
        }

        // Case 3 : If there are not enough peripheral-vectors at parent level: NOT
        return pOrderedVs.getNumberOfPeripheralVectors() >= pMaxNumPeripheralVectors;
    }

    /**
     * Translates the coordinates and then inserts the vectors into the vs.
     * Returns the not inserted vectors.
     */
    public List<VectorData> addNewVectorsToTree(
            List<VectorData> pVectorsToAdd,
            VectorSpace criteriaVs,
            VsComparisonCriteriaHandler pSeedingComparator,
            VectorSpace pRawVs) throws Exception {

        // First translate the coordinates to the new system
        recomputeVectorListCoordinates_RelativeToVs(criteriaVs, pVectorsToAdd, pSeedingComparator);

        // Add the vectors and return the not inserted ones
        return addVectorsToTree(pVectorsToAdd, criteriaVs, pRawVs);
    }

    /**
     * Adds the provided vectors to a tree and returns the ones not inserted
     */
    public List<VectorData> addVectorsToTree(
            List<VectorData> pVectorsToAdd,
            VectorSpace criteriaVs,
            VectorSpace pRawVs) throws Exception {
        List<VectorData> retVal = new ArrayList<VectorData>();
        List<TreeResult> similarParents = null;
        VectorData vectorToAdd = null;

        VsComparisonCriteriaHandler comparator = criteriaVs.getComparator();

        for (int i = pVectorsToAdd.size() - 1; i >= 0; i--) {
            vectorToAdd = pVectorsToAdd.get(i);
            similarParents = criteriaVs.getVectorManager().treeSearchParents(
                    vectorToAdd,
                    criteriaVs,
                    10,
                    0.2f,
                    false);

            // If there is a similar SIGNIFICANT parent
            if (similarParents.size() > 0
                    &&
                    comparator.isFirstSimilarityBiggerOrEqual(
                            similarParents.get(0).getSimilarity(),
                            comparator.getMinSimilarityValue())) {
                TreeResult mostSimilarParent = similarParents.get(0);
                // Add it to the most similar parent. It will be extracted from the list. First element.
                hangVectorFromParentUsingResult(vectorToAdd,
                        mostSimilarParent);
                // Add the vector to the raw vs
//					pRawVs.addVector(pVectorsToAdd.get(i));

                // remove vector from provided list
                pVectorsToAdd.remove(i);
            } else {
                retVal.add(pVectorsToAdd.get(i));
            }
        }

        return retVal;
    }

    public void adjustDistanceToParent_ofChildren(VectorData pParentVector) throws Exception {

        if (null != pParentVector.getVectorSpace()) {
            VectorSpace vs = pParentVector.getVectorSpace();
            for (int i = 0; i < vs.size(); i++) {
                // Compute the similarity to immediate parent
                double similarity = vs.obtainSimilarity(pParentVector, vs.get(i));

                // Set the sim to parent in the child
                vs.get(i).setDistanceToParent((float) similarity);

                if (vs.get(i).getVectorSpace() != null) {
                    // adjust similarities to parents for the children of this element
                    adjustDistanceToParent_ofChildren(vs.get(i));
                }
            }
        }

    }

    public boolean checkCoordinateSizeUpOnTheTree_comparingWithParents(VectorSpace pVsToCheck) throws Exception {
        VectorData child = null;
        int childCoordinatesNumber = 0;
        VectorData lastParent = null;
        childCoordinatesNumber = pVsToCheck.get(0).getByteCoordinates().length;

        for (int vsPos = 0; vsPos < pVsToCheck.size(); vsPos++) {
            child = pVsToCheck.get(vsPos);

            if (child.getByteCoordinates().length != childCoordinatesNumber) {
                logLine(log, "************* child whith different size than the rest!! " + vsPos +
                        " Expected: " + childCoordinatesNumber +
                        " Found: " + child.getByteCoordinates().length +
                        " child name: " + child.getData());
                return false;
            }

            lastParent = child.getParentVector();

            while (lastParent != null) {
                if (lastParent.getByteCoordinates().length != childCoordinatesNumber) {
                    logLine(log, "************* PARENT whith different size than the rest!! child pos: " + vsPos +
                            " Expected: " + childCoordinatesNumber +
                            " Found: " + lastParent.getByteCoordinates().length +
                            " child name: " + child.getData() +
                            " parent name: " + lastParent.getData());
                    return false;
                }
                lastParent = lastParent.getParentVector();
            }
        }

        return true;
    }

    private void clearMaxDistancesTochildrenInEveryVs(VectorSpace pOrderedVs) {
        pOrderedVs.setMaxChildDistanceToRefVector((float) pOrderedVs.getComparator().getMaxSimilarityValue());
        //pOrderedVs.setMaxChildDistanceToRefVector( 0f );
        for (int i = 0; i < pOrderedVs.size(); i++) {
            if (pOrderedVs.get(i).getVectorSpace() != null) {
                clearMaxDistancesTochildrenInEveryVs(pOrderedVs.get(i).getVectorSpace());
            }
        }
    }

    public List<byte[]> createSeedingByteArrayListFromVs(
            VectorSpace pVs,
            List<VectorData> pDistantVectors
    ) throws Exception {

        List<byte[]> retList = new ArrayList<byte[]>();

//		for (int i=0; i<50; i++) {
//			VectorData rndDistantVector = Sampling.chooseRandomVector(pDistantVectors, true);
//			retList.add( rndDistantVector.getByteCoordinates().clone() );
//		}


        for (int i = 0; i < pVs.size(); i++) {
            retList.add(pVs.get(i).getByteCoordinates().clone());
        }

//		// Add as many new vectors as the ones already added
//		List<VectorData> separatedVectors = Sampling.buildClonedRandomSample(pRawVs, retList.size(), true, true).getVectorList();
//
//		// Separate vectors in space
//		separatedVectors = separateVectors( separatedVectors, pRawVs );
//
//		// add the vectors to the ret list
//		originalVectors.addAll(  );
//
//		// Eliminate the very similar ones
//		separatedVectors = eliminateSimilarVectors( separatedVectors );

        return retList;
    }

    private List<VectorData> separateVectors(List<VectorData> pVectorsToSeparate, VectorSpace pRawVs) {


        return pVectorsToSeparate;
    }

    private List<VectorData> eliminateSimilarVectors(List<VectorData> pVectorsToSeparate) {

        return pVectorsToSeparate;
    }

    private void hangVectorFromParentUsingResult(
            VectorData pVectorToHang,
            TreeResult pParentResult) throws Exception {

        // Set the distance to the parent
        // TODO: check that the similarity is informed correctly on the result (it is a parent)
        pVectorToHang.setDistanceToParent((float) pParentResult.getSimilarity());

        // Add the vector to the parent
        VectorData parentVector = pParentResult.getFoundVectorData();
        parentVector.getVectorSpace().getVectorList().add(pVectorToHang);
        pVectorToHang.setParentVector(parentVector);

        // Increase the max distances to parents if needed
        increaseMaxDistanceToChildren_onParentPathToTop(pVectorToHang);

    }

    public void increaseMaxDistanceToChildren_onParentPathToTop(VectorData pVectorToHang) throws Exception {

        VectorData lastParent = pVectorToHang.getParentVector();
        double similarity = 0d;
        VsComparisonCriteriaHandler comparator = null;

        if (null != lastParent) {
            comparator = lastParent.getVectorSpace().getComparator();
        }

        int count = 0;

//		if (pVectorToHang.getData().equals("11111 55")) {
//			count = 0;
//		}

        while (null != lastParent && count < 10000) {
            similarity = comparator.computeSimilarity(
                    pVectorToHang.getByteCoordinates(),
                    lastParent.getByteCoordinates());

            if (comparator.isFirstSimilarityBiggerOrEqual(
                    lastParent.getVectorSpace().getMaxChildDistanceToRefVector(),
                    similarity)) {
                lastParent.getVectorSpace().setMaxChildDistanceToRefVector((float) similarity);
            }

            lastParent = lastParent.getParentVector();
            count++;
        }

        if (count >= 10000) {
            throw new Exception("increaseMaxDistanceToChildren_onParentPathToTop got an VERY large loop, > 10000 iterations");
        }

    }

    public void increaseMaxDistanceToChildren_onParentPathToBottom_respectToThisParent(
            VectorData pParentToAdjust,
            VectorSpace pVsToMonitor) throws Exception {

        for (int i = 0; i < pVsToMonitor.size(); i++) {
            VectorData child_vector = pVsToMonitor.get(i);
            VectorSpace childVs = child_vector.getVectorSpace();
            // if CHILD
            if (childVs == null) {

                double sim = pVsToMonitor.obtainSimilarity(pParentToAdjust, child_vector);
                if (pVsToMonitor.getComparator().isFirstSimilarityBiggerOrEqual(
                        pParentToAdjust.getVectorSpace().getMaxChildDistanceToRefVector(),
                        sim)) {
                    pParentToAdjust.getVectorSpace().setMaxChildDistanceToRefVector((float) sim);
                }

            } else {
                // if parent
                increaseMaxDistanceToChildren_onParentPathToBottom_respectToThisParent(pParentToAdjust, childVs);
            }
        }

    }

    /**
     * Recomputes all the distances of the children to the parent vectors.
     */
    public void recomputeChildrenDistancesToParents(VectorSpace pRawVs, VectorSpace pOrderedVs) throws Exception {
        VectorData childVector = null;

        // first, clear the previous max distances to children in all the vs.
        // this is needed because the criteria could have been different, and so, the distances do not apply.
        clearMaxDistancesTochildrenInEveryVs(pOrderedVs);

        // adjust the MIN SIMILARITY (maximum distance) BOTTOM-UP
        for (int childPosInRawVs = 0; childPosInRawVs < pRawVs.size(); childPosInRawVs++) {

            childVector = pRawVs.get(childPosInRawVs);

            if (null != childVector.getParentVector()) {
                // adjust the MAX SIMILARITY
                // this starts down in the tree and goes up until the first ref vector
                increaseMaxDistanceToChildren_onParentPathToTop(childVector);
            }
        }

        // adjust distances to parents. UP-BOTTOM
        for (int refPosInOrdVs = 0; refPosInOrdVs < pOrderedVs.size(); refPosInOrdVs++) {
            adjustDistanceToParent_ofChildren(pOrderedVs.get(refPosInOrdVs));
        }

    }

    /**
     * Recomputes all the distances of the children to the parent vector IN ONLY ONE LAYER.
     */
    public void recomputeChildrenDistancesToParents(VectorSpace pOrderedVs) throws Exception {

        for (int i = 0; i < pOrderedVs.size(); i++) {
            recomputeChildDistanceToParent(pOrderedVs.get(i));
        }
    }

    public void recomputeChildDistanceToParent(VectorData pVector) throws Exception {
        VectorData parent = pVector.getParentVector();

        if (null != parent) {
            double sim = parent.getVectorSpace().obtainSimilarity(parent, pVector);
            pVector.setDistanceToParent((float) sim);
        }
    }

    public void show_refVectors(VectorSpace pCritVs) throws Exception {

        for (int i = 0; i < pCritVs.size(); i++) {
            logLine(log, i + "\t"
                    + "\t- Marked: " + pCritVs.get(i).isMarked()
                    + "\tNum children: ", false);

            if (null != pCritVs.get(i).getVectorSpace()) {
                logLine(log, pCritVs.get(i).getVectorSpace().size() + "\t- ", false);
                logLine(log, "\tMax dist:" + pCritVs.get(i).getVectorSpace().getMaxChildDistanceToRefVector(), false);
            } else {
                logLine(log, " 0 ", false);
                logLine(log, "\tMax dist: N/A", false);
            }
            logLine(log, "\t" + pCritVs.get(i).getData() + "\t\t Coord: ", false);

            // The final coordinates
            int numCoordinatesToShow = pCritVs.get(i).getByteCoordinates().length;
            if (numCoordinatesToShow > 100) {
                numCoordinatesToShow = 100;
            }
            for (int coord = 0; coord < numCoordinatesToShow; coord++) {
                logLine(log, "," + pCritVs.get(i).getByteCoordinates()[coord], false);
            }

            logLine(log, "");
        }
    }

    public void show_refVectors_tree(VectorSpace pVs, int pDepth) {
        pDepth++;
        String tabs = "";
        String line = null;
        boolean showInConsole = false;

        for (int g = 0; g < pDepth; g++) {
            tabs += "\t";
        }

        for (int i = 0; i < pVs.size(); i++) {
//			tabs = "";

            line = tabs + "- [" + pDepth + "] pos: " + i +
                    " string: " + pVs.get(i).getData() +
                    "\tSim2Parent=" + pVs.get(i).getDistanceToParent();

            logLine(log, line, false);

            if (showInConsole) {
                System.out.print(line);
            }

            VectorSpace childVs = pVs.get(i).getVectorSpace();

            if (pVs.get(i).getParentVector() == null) {
                line = "\tPARENT: null";
                logLine(log, line, false);
                if (showInConsole) {
                    System.out.print(line);
                }
            } else {
                line = "\tPARENT: " + pVs.get(i).getParentVector().getData();
                logLine(log, line, false);
                if (showInConsole) {
                    System.out.print(line);
                }
            }

            if (null != childVs) {
                line = "\t# MaxDist2CHILD = " + childVs.getMaxChildDistanceToRefVector();
                logLine(log, line, false);

                if (showInConsole) {
                    System.out.println(line);
                }

                line = "\tDIM: ";
                for (int j = 0; j < pVs.get(i).getByteCoordinates().length; j++) {
                    line += pVs.get(i).getByteCoordinates()[j] + ",";
                }
                logLine(log, line);
                show_refVectors_tree(childVs, pDepth);
            } else {
                line = "";
                logLine(log, line, false);
                if (showInConsole) {
                    System.out.println(line);
                }

                line = "\tDIM: ";
                for (int j = 0; j < pVs.get(i).getByteCoordinates().length; j++) {
                    line += pVs.get(i).getByteCoordinates()[j] + ",";
                }
            }


            line = "";
            logLine(log, line);

        }

//		line = tabs + "# NumberOfPeripheralVectors = " + pVs.getNumberOfPeripheralVectors();
//		logLine(log,line);
    }

    /**
     * Show the results in the system (future log)
     */
    public void show_results(BufferedWriter log, List<TreeResult> results) throws Exception {
        for (int resPos = 0; resPos < results.size(); resPos++) {
            VectorData vectorData = results.get(resPos).getFoundVectorData();

            logLine(log, "\t - Result : " + resPos + "\t"
                    + vectorData.getData()
                    + "\tSim : " + results.get(resPos).getSimilarity(), false);

            if (null != vectorData.getVectorSpace()) {
                logLine(log,
                        "\t(if REF... max_dist_to_child: " +
                                vectorData.getVectorSpace().getMaxChildDistanceToRefVector() +
                                "\t");
            } else {
                logLine(log, "");
            }
        }
    }

    public void show_results_with_original_similarities(
            BufferedWriter log,
            List<TreeResult> results,
            VectorSpace pVs,
            VectorData pSearchedVector) throws Exception {

        logLine(log, "## recomputing results similarity for comparator: " + pVs.getOriginalComparatorWhenTraining().getCriteriaName() + "...");
        for (int resPos = 0; resPos < results.size(); resPos++) {
            TreeResult resultado = results.get(resPos);
            VectorData v1 = resultado.getFoundVectorData();
            VectorData v2 = pSearchedVector;
            double sim = pVs.getOriginalComparatorWhenTraining().computeSimilarity(v1.getData().getBytes(StandardCharsets.UTF_8), v2.getData().getBytes(StandardCharsets.UTF_8));
            resultado.setSimilarity(sim);
        }
        logLine(log, "## Showing the results (similarity recomputed) :");
        show_results(log, results);
    }

    public void show_vdList(List<VectorData> pVectorList) throws Exception {

        if (pVectorList == null || pVectorList.size() == 0) {
            logLine(log, "show_vdList : list is null or empty.");
            return;
        }

        for (int i = 0; i < pVectorList.size(); i++) {
            logLine(log, "\t- Distance: " + pVectorList.get(i).getDistanceToParent() + "\tChild Vector (string):" + pVectorList.get(i).getData() + "\tChild Vector (byteCoordenates):", false);
            for (int j = 0; j < pVectorList.get(i).getByteCoordinates().length; j++) {
                logLine(log, "," + pVectorList.get(i).getByteCoordinates()[j], false);
            }
            logLine(log, "");
        }

    }

    public void test_father_Child_references(VectorSpace pVs) throws Exception {

        for (int i = 0; i < pVs.size(); i++) {
            testAllChildrenPointToParent(pVs.get(i));
        }
    }

    public void test_recursiveness_OLD(VectorSpace pVs) throws Exception {

        for (int i = 0; i < pVs.size(); i++) {

            VectorSpace childVs = pVs.get(i).getVectorSpace();

            if (null != childVs) {
                for (int j = 0; j < childVs.size(); j++) {

                    // If child vs contains parent vector
                    if (pVs.get(i).equals(childVs.get(j))) {
                        throw new Exception("recursiveness found in vs !");
                    }
                }
            }
        }
    }

    public void test_repetitions_OLD(VectorSpace pCriteriaVs, VectorSpace pVs) throws Exception {

        for (int i = 0; i < pVs.size(); i++) {
            for (int j = 0; j < pCriteriaVs.size(); j++) {

                // If shared vector
                if (pVs.get(i).equals(pCriteriaVs.get(j))) {
                    throw new Exception("repetitions found in vs !");
                }
            }
        }
    }

    /**
     * Trains a vs. It assigns children to parent using proximity, and then it recomputes the coordinates.
     */
    public VectorSpace train_(
            VectorSpace pCriteriaVs,
            VectorSpace pRawVs,
            boolean pAverageParentCoordinatesUsingChildren,
            boolean pRelocateCoordinates_relativeToParents,
            boolean pTrainDeeperLevels,
            int pMinSizeOfVsForTrainingIt,
            int pNumFirstLayerVectorsVectors,
            int pMaxSizeOfSampledVsForRefineSampling,
            int pNumPasses,
            boolean pRefineRefVectors,
            boolean pCreateSeedingVectorsPerLayer
    ) throws Exception {

        boolean useRefVectorsAsSeedingVectors = false;

        logLine(Hierarchy_utils.log, "#### TRAINING vs with: " + pRawVs.size() + " elements. Comparator: " + pRawVs.getComparator().getCriteriaName());

        boolean processOrphans = true;
        int numRefVectors = 3;

        // This is the comparator that comes with the criteria vs. It defines the initial criteria for comparing the vectors.
        // It will be used for the later addition of new vectors
        // It will be replaced later with the final one if this is the first pass (=> pAverageParentCoordinatesUsingChildren == true)
        // TODO: record this element in the vs as a member of a list, for future processing purposes.
        VsComparisonCriteriaHandler seedingComparator = pCriteriaVs.getComparator();

        // Defining the NUMBER OF REF VECTORS for this layer
        // -----------------------------------------------------------------------
        if (pRelocateCoordinates_relativeToParents) {
            numRefVectors = pNumFirstLayerVectorsVectors;
            pCriteriaVs.setOriginalComparatorWhenTraining(pCriteriaVs.getComparator());
            pRawVs.setOriginalComparatorWhenTraining(pCriteriaVs.getComparator());
        } else {
            // If a the deeper training pass
            // TODO: this check should be in first place. Before "if (pRelocateCoordinates_relativeToParents) ..."
            if (pRawVs.size() < pMinSizeOfVsForTrainingIt) {
                logLine(Hierarchy_utils.log, "**** returning the provided vs since: pRawVs.size() < pMinSizeOfVsForTrainingIt . pRawVs.size()= "
                        + pRawVs.size() + "\tFirst vector name: ", false);
                if (!pCriteriaVs.getVectorList().isEmpty()) {
                    logLine(Hierarchy_utils.log, pCriteriaVs.get(0).getData());
                }
                return pRawVs;
            } else if (pRawVs.size() < 1000) {
                numRefVectors = (int) Math.round(Math.log10(pRawVs.size())) + 2;
            }
        }


        // Mark the elements in world vs:
        // ----------------------------------------
        //	- Only marked ones will be used
        pRawVs.markAllVectorsInList();

        logLine(log, "\t# numRefVectors to use = " + numRefVectors);

        // Sample the vs into a few number of elements to take into account
        System.out.println("# Sample the vs into a few number of elements to take into account...");
        pCriteriaVs = Sampling.buildClonedRandomSample(
                pRawVs,
                numRefVectors,
                true,
                true);


        // Use the new parents to define the new positions of the children
        // -----------------------------------------------------------------
        if (pRelocateCoordinates_relativeToParents) {
            // Setting the seeding vectors
            // ---------------------------
            System.out.println("# setByteArraySeedingList...");

            // Create the seeding vectors
            List<byte[]> seedingVectorList = null;
            if (useRefVectorsAsSeedingVectors) {
                seedingVectorList = createSeedingByteArrayListFromVs(
                        pCriteriaVs,
                        pCriteriaVs.getOrphanList());
            } else {
                seedingVectorList = createSeedingByteArrayListForPairSim(100);
            }

            pCriteriaVs.setByteArraySeedingList(seedingVectorList);

            // Relocate parent according to children positions.
            // This averages coordinates looking for the centroids
            if (pAverageParentCoordinatesUsingChildren) {
                if (!seedingComparator.isNumDimensionsFix()) {
                    new Exception("train method : not possible to average the parent positions because the comparator is not a mathematical one (does not contain a guarantied fix number of dimensions.)");
                }
                System.out.println("# Relocate parent according to children positions....");
                // Average the position of the parents using their children positions
                // TODO: REVIEW averaging.
                averageParentCoordinatesUsingChildren(pCriteriaVs);
            }

            // Recomputing the coordinates for the criteria vs.
            System.out.println("# Recomputing the coordinates for the criteria vs...");
            pCriteriaVs = Hierarchy_utils.recomputeVsCoordinates(pCriteriaVs);
            // Recompute the coordinates of the raw vs. Next line is needed since the
            //	refining now happens after the computations of the dimensions.
            recomputeVsCoordinates_RelativeToVs(pCriteriaVs, pRawVs);

            // DEBUG
            if (DEBUG_INTEGRITY_CHECKS && !checkCoordinateSizeUpOnTheTree_comparingWithParents(pRawVs)) {
                logLine(Hierarchy_utils.log, "\t In trainning AFTER recomputing coordinates");
                logLine(Hierarchy_utils.log, "########################## Showing the ref vector tree...");
                show_refVectors_tree(pCriteriaVs, 0);
            }

            // ***************************************************
            // Change the comparator (set in train after testing)
            // ***************************************************
            VsCriteria_Distance newComparator = new VsCriteria_Distance();
//			VsCriteria_Distance_Normalized	newComparator = new VsCriteria_Distance_Normalized();
//			VsCriteria_Cosine newComparator = new VsCriteria_Cosine();
            pCriteriaVs.setComparatorDrillDown(newComparator);
            pRawVs.setComparator(newComparator);
            // ***************************************************


            // Checking integrity of coordinates
            if (DEBUG_INTEGRITY_CHECKS
                    &&
                    seedingComparator.isNumDimensionsFix()
                    && !checkCoordinateSizeUpOnTheTree_comparingWithParents(pRawVs)
            ) {
                logLine(Hierarchy_utils.log, "********* Different sizes on coordinates (ERROR) in trainning previously to recompute coordinates");
                throw new Exception("train method : Different sizes on coordinates (ERROR in trainning previously to recompute coordinates).");
            }

        }


        // Compute the metrics to get the average distance in the space
        // TODO: review the selection of the distance
        // TODO: only compute metrics on the first pass
        VectorSpaceMetrics rawVsMetrics = new VectorSpaceMetrics(pRawVs);
        float avgDistanceRawSpace = rawVsMetrics.getAverageSimilarity();

        // Compute the mean value for the average-similarity for later usage
        float similarityForTheTraining = (float) pCriteriaVs.getComparator().getHalfWayToMinimumSimilarity(avgDistanceRawSpace);
//		similarityForTheTraining = (float)pCriteriaVs.getComparator().getHalfWayToMinimumSimilarity( similarityForTheTraining );

        logLine(log, "\t# Computed similarityForTheTraining = " + similarityForTheTraining);


        // Refine the ref vectors
        // ---------------------------------------------------------------------
        logLine(Hierarchy_utils.log, "\t# Ref vectors BEFORE refineRefVectors() :");
        show_refVectors(pCriteriaVs);

        System.out.println("# Refining...");
        // Refine ref vectors
        if (pRefineRefVectors) {
            pCriteriaVs = refineRefVectors(pCriteriaVs,
                    pRawVs,
                    pNumPasses,
                    similarityForTheTraining,
                    pMaxSizeOfSampledVsForRefineSampling);
        }

        // Clear the vector spaces of the parents
        clearVsFromVectors(pCriteriaVs);


        // Assign the children to the parents
        // -----------------------------------------------------------------
        System.out.println("# Assign the children to the parents...");
        assignChildrenToParents(pCriteriaVs, pRawVs, similarityForTheTraining);

        logLine(Hierarchy_utils.log, "\t# Ref vectors BEFORE cleanRefVectorWithoutChildren() :");
        show_refVectors(pCriteriaVs);

        // Get rid of the non relevant parent ref vectors, the ones without children.
        System.out.println("# cleanRefVectorWithoutChildren...");
        pCriteriaVs = cleanRefVectorWithoutChildren(pCriteriaVs);


        // If it was not achieved a new vs with more than 1 element, we return the same vs that we received.
        if (pCriteriaVs.size() < 2) {
            logLine(Hierarchy_utils.log, "**** Returning the provided vs since: Not enougth parent ref vectors. pCriteriaVs.size()= "
                    + pCriteriaVs.size() + "\tFirst vector name: ", false);
            if (!pCriteriaVs.getVectorList().isEmpty()) {
                logLine(Hierarchy_utils.log, pCriteriaVs.get(0).getData());
            }
            return pRawVs;
        }


        // Show the orphan number
        logLine(log, "\t- numOrphanVectors: " + pCriteriaVs.getOrphanList().size());
        logLine(log, "\t- numAssignVectors: " + (pRawVs.size() - pCriteriaVs.getOrphanList().size()));

        if (pTrainDeeperLevels) {
            // Review the vs. The aim is to replace them with trained vs
            for (int i = 0; i < pCriteriaVs.size(); i++) {
                VectorSpace childVs = pCriteriaVs.get(i).getVectorSpace();
                if (null != childVs && childVs.size() > pMinSizeOfVsForTrainingIt) {

                    VectorSpace newVs = childVs.cloneFrame();

                    newVs = train_(newVs,
                            childVs,
                            false,
                            pCreateSeedingVectorsPerLayer, // to allow seeding vecs per layer. Default: false
                            pTrainDeeperLevels,
                            pMinSizeOfVsForTrainingIt,
                            pNumFirstLayerVectorsVectors,
                            pMaxSizeOfSampledVsForRefineSampling,
                            pNumPasses,
                            pRefineRefVectors,
                            pCreateSeedingVectorsPerLayer);

                    // Set the trained vs for this vector
                    // set the references of the children to the parents
                    pCriteriaVs.get(i).setVectorSpace(newVs);

                    // Move the orphans to the parent ref vs
                    moveOrphans(newVs, pCriteriaVs);
                }

            }
        }

        if (pRelocateCoordinates_relativeToParents) {
            // *******************************************************************************
            // Orphans
            // *******************************************************************************
            logLine(log, "\t# Orphans before reassigning them = " + pCriteriaVs.getOrphanList().size());
            show_vdList(pCriteriaVs.getOrphanList());


            // Process the orphans
            // --------------------------------------------------------------------------
            if (processOrphans) {
                List<VectorData> remainingOrphans = addVectorsToTree(
                        pCriteriaVs.getOrphanList(),
                        pCriteriaVs,
                        pRawVs);
//
//			Hierarchy_utils_incremental hui = new Hierarchy_utils_incremental();
//			List<VectorData> remainingOrphans = hui.addNewVectorsToTree_afterTraining(
//															pCriteriaVs.getOrphanList(),
//															pCriteriaVs,
//															seedingComparator,
//															pRawVs,
//															similarityForTheTraining,
//															0);
//
//				// Set the remaining orphans in the vs
                pCriteriaVs.setOrphanList(remainingOrphans);
            }

            // Orphans
            logLine(log, "\t# number of orphans AFTER reassigning them = " + pCriteriaVs.getOrphanList().size());
            // *******************************************************************************


            // Recompute children distances to parents
            // ---------------------------------------
            recomputeChildrenDistancesToParents(pRawVs, pCriteriaVs);

            // Test integrity of the vs...
            // ---------------------------------------

            // zero max similarity to child
            VectorData firstTroublesomeVector = pRawVs.findParentWithZeroMaxDistDrillDown();
            if (null != firstTroublesomeVector) {
                Hierarchy_utils.logLine(Hierarchy_utils.log, "\t****** Found parent vector with max dist to child being ZERO : " + firstTroublesomeVector.getData());
            }

            // Checking integrity of coordinates
            if (!checkCoordinateSizeUpOnTheTree_comparingWithParents(pRawVs)) {
                Hierarchy_utils.logLine(Hierarchy_utils.log, "********* Different sizes on coordinates (ERROR) in trainning previously to recompute coordinates");
            }

            test_recursiveness_OLD(pCriteriaVs);
//			test_repetitions_OLD(pCriteriaVs, pRawVs);
            test_father_Child_references(pCriteriaVs);

        }

        if (!pCriteriaVs.getVectorList().isEmpty()) {
            logLine(Hierarchy_utils.log, "#### Ret. TRAINED VS. pCriteriaVs.size()= "
                    + pCriteriaVs.size() + "\tFirst vector name: " + pCriteriaVs.get(0).getData());
        }

        return pCriteriaVs;
    }


}
