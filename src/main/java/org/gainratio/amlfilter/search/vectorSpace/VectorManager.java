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

package org.gainratio.amlfilter.search.vectorSpace;

import org.gainratio.amlfilter.search.comparisonCriteria.VsComparisonCriteriaHandler;
import org.gainratio.amlfilter.search.utils.DoubleArrayOutputStream;
import org.gainratio.amlfilter.search.utils.IntArrayOutputStream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.Serializable;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;


public class VectorManager implements Serializable {
    private static final long serialVersionUID = -710096414609733146L;
    private static final Logger logger = LoggerFactory.getLogger(VectorManager.class);
    public boolean DEBUG_LOG = false;
    private Locale mLocale = new Locale("UTF-8");
    /**
     * Counter for the number of actual comparisons
     */
    private int mCounter = 0;

    static void addChildToResults(
            List<TreeResult> pResultsListToReturn,
            VectorData4Tree pFound,
            double pSimilarity,
            VectorData4Tree pParentVectorData) {

        // Add child to the results
        TreeResult newResult = new TreeResult();
        newResult.setSimilarity(pSimilarity);
        newResult.setFoundVectorData(pFound);
        newResult.setParent(pParentVectorData);
        pResultsListToReturn.add(newResult);

    }

    public Locale getLocale() {
        return mLocale;
    }

    public void setLocale(Locale pLocale) {
        mLocale = pLocale;
    }

    public int getCounter() {
        return mCounter;
    }

    public void setCounter(int pTagCounter) {
        mCounter = pTagCounter;
    }


//	/**
//	 * The Number Of Comparisons made when searching in order to reach to a set of results.
//	 */
//	private int mNumberOfComparisons = 0;
//
//	/**
//	 * Gets the Number Of Comparisons
//	 * @return the distance
//	 */
//	public int getNumberOfComparisons() {
//		return mNumberOfComparisons;
//	}
//
//	/**
//	 * Sets the Number Of Comparisons
//	 * @param pNumberOfComparisons the number of comparisons made.
//	 */
//	public void setNumberOfComparisons(int pNumberOfComparisons) {
//		this.mNumberOfComparisons = pNumberOfComparisons;
//	}
//	
//	/**
//	 * Inc the Number Of Comparisons
//	 */
//	public void incNumberOfComparisons() {
//		this.mNumberOfComparisons++ ;
//	}

    public void incCounter() {
        mCounter++;
    }

    /**
     * Apply cosine vector weighting
     *
     * @param pVectorDimensionSubsetDefinition The vector dimension subset definition
     * @param pGeneratedVector                 The generated vector
     * @param pByteVectorOutputStream          The bit set vector output stream
     * @throws IOException
     */
    protected void applyByteVectorWeighting(final VectorDimensionSubsetDefinition pVectorDimensionSubsetDefinition,
                                            byte[] pGeneratedVector,
                                            ByteArrayOutputStream pByteVectorOutputStream)
            throws IOException {
        float weight = pVectorDimensionSubsetDefinition.getCosineVectorBuildingWeight();

        // No weight means ignore this subset
        if (0 == weight) {
            return;
        }

        // Cannot exceed 100% in weighting because one could overflow the
        // data type of the dimension
        if (weight > 1) {
            weight = 1;
        }

        // Apply the weight to each dimension
        for (int i = 0; i < pGeneratedVector.length; i++) {
            pGeneratedVector[i] *= weight;
        }

        pByteVectorOutputStream.write(pGeneratedVector);
    }

    protected void applyIntVectorWeighting(final VectorDimensionSubsetDefinition pVectorDimensionSubsetDefinition,
                                           int[] pGeneratedVector,
                                           IntArrayOutputStream pIntVectorOutputStream)
            throws IOException {
        float weight = pVectorDimensionSubsetDefinition.getCosineVectorBuildingWeight();

        // No weight means ignore this subset
        if (0 == weight) {
            return;
        }

        // Cannot exceed 100% in weighting because one could overflow the
        // data type of the dimension
        if (weight > 1) {
            weight = 1;
        }

        // Apply the weight to each dimension
        for (int i = 0; i < pGeneratedVector.length; i++) {
            pGeneratedVector[i] *= weight;
        }

        pIntVectorOutputStream.write(pGeneratedVector, 0, pGeneratedVector.length);
    }

    protected void applyDoubleVectorWeighting(final VectorDimensionSubsetDefinition pVectorDimensionSubsetDefinition,
                                              double[] pGeneratedVector,
                                              DoubleArrayOutputStream pDoubleVectorOutputStream)
            throws IOException {

        pDoubleVectorOutputStream.write(pGeneratedVector, 0, pGeneratedVector.length);
    }

    public VectorData4Tree createVector(VectorDefinition pVectorDefinition,
                                        final byte[] pIncomingData) throws Exception {
        final String methodSignature = "VectorManager createVector(VectorDefinition,byte[]): ";

        if (null == pVectorDefinition) {
            throw new IllegalArgumentException("The vector definition cannot be null");
        }

        if (null == pIncomingData || 0 == pIncomingData.length) {
            return null;
        }

//		Create a buffer that will hold all the bytes vector data from all the subset definitions
        ByteArrayOutputStream vectorBytesOutputStream = new ByteArrayOutputStream();

        List<VectorDimensionSubsetDefinition> vectorDimensionSubsetDefinitions = pVectorDefinition.getVectorDimensionSubsetDefinitions();

        int vectorDimensionSubsetDefinitionsSize = vectorDimensionSubsetDefinitions.size();
        VectorDimensionSubsetDefinition vdsd = null;
        VectorDimensionSubsetHandler vdsh = null;
        byte[] generatedVector = null;

        for (int i = 0; i < vectorDimensionSubsetDefinitionsSize; i++) {
            vdsd = vectorDimensionSubsetDefinitions.get(i);
            vdsh = vdsd.getVectorDimensionSubsetHandler();
            generatedVector = vdsh.generateVectorDimensionSubset(pIncomingData);

            applyByteVectorWeighting(vdsd, generatedVector, vectorBytesOutputStream);
        }

        byte[] vectorBytes = vectorBytesOutputStream.toByteArray();
        vectorBytesOutputStream.close();

        VectorData4Tree vectorData = new VectorData4Tree();

        vectorData.setData(new String(pIncomingData, getLocale().getDisplayName()));
        vectorData.setByteCoordinates(vectorBytes);

        return vectorData;
    }


//	/**
//	 * Filter the current vector data by the vector results and return
//	 * the new filtered list.
//	 * @param pVectorDataList The vector data list
//	 * @param pVectorResultList The vector result list
//	 * @return The filtered vector data
//	 */
//	public List<VectorData> obtainFilteredVectorData(List<VectorData> pVectorDataList, 
//													 List<VqSearchResult> pVectorResultList)
//	{
//		final String methodSignature = "List<VectorData> obtainFilteredVectorData(List<VectorData>,List<VqSearchResult>): ";
//		
//		VectorData vectorData = null;
//		List<VectorData> filteredVectorDataList = new ArrayList<VectorData>();
//		
//        for (int i = 0; i< pVectorResultList.size(); i++)
//        {
//        	VqSearchResult vectorResult = (VqSearchResult) pVectorResultList.get(i);
//        	//position = vectorResult.mPositionInVectorList;
//        	vectorData = vectorResult.mFoundVectorData;
//        	//filteredVectorDataList.add(pVectorDataList.get(position));
//        	filteredVectorDataList.add(vectorData);
//        }
//		
//        return filteredVectorDataList;
//	}

    public VectorData4Tree createVector(VectorDefinition pVectorDefinition,
                                        final byte[] pIncomingData,
                                        VsComparisonCriteriaHandler pComparator,
                                        VectorSpace pCriteriaVs) throws Exception {
        VectorData4Tree newVector = new VectorData4Tree();

        // Allow the bytes to be informed with the name so we can use later when comparing
        newVector.setByteCoordinates(pIncomingData);
        newVector.setData(new String(pIncomingData, getLocale().getDisplayName()));

        newVector.setByteCoordinates(
                Hierarchy_utils
                        .getTranslatedCoordinatesRelativeToVs(
                                newVector,
                                pCriteriaVs,
                                pComparator)
        );


        return newVector;
    }

    public List<TreeResult> obtainByteVectorSimilarities(VectorData4Tree pSearchVectorData,
                                                         List<VectorData4Tree> pVectorDataList,
                                                         int pMaxResults,
                                                         int pStartPos,
                                                         int pEndPos,
                                                         double pMinSimilarityAllowed,
                                                         VsComparisonCriteriaHandler pComparator,
                                                         boolean pIgnoreMarkedVectors) {

        final String methodSignature = "List<VqSearchResult> obtainByteVectorSimilarities(byte[],List<byte[]>,int): ";

        if (null == pSearchVectorData) {
            return new ArrayList<TreeResult>();
        }

        int insertionPoint = -1;
        int numVectors = pVectorDataList.size();
        TreeResult vectorResult = new TreeResult();
//		VectorResultCosineSimilarityComparator vrcsc = VectorResultCosineSimilarityComparator.getInstance();
        List<TreeResult> vectorResultList = new ArrayList<TreeResult>();

        int startPos = 0;
        int endPos = numVectors - 1;

        try {
//			Validate start and end positions
            if (pStartPos <= pEndPos) {
                if (pStartPos >= 0 && pStartPos < pVectorDataList.size() - 1) {
                    startPos = pStartPos;
                } else {
//					System.out.println(" ** Error in Start Pos Params");
                }

                if (pEndPos >= 0 && pEndPos < pVectorDataList.size()) {
                    endPos = pEndPos;
                } else {
//					System.out.println(" ** Error in End Pos Params");
                }
            } else {
                System.out.println(" ** Error in Start vs End Pos Params");
            }

            vectorResult.similarity = pComparator.minSimilarityValue;
//			Add a dummy vector result for the comparison
            vectorResultList.add(0, vectorResult);
            double similarity = vectorResultList.get(0).similarity;
            VectorData4Tree vectorData = null;
            byte[] vector = null;
            int vectorResultListSize = -1;
            byte[] searchVectorDataBytes = pSearchVectorData.getByteCoordinates();

            for (int i = startPos; i < endPos + 1; i++) {
                vectorData = pVectorDataList.get(i);
                if (null == vectorData) {
                    continue;
                }
                if (pIgnoreMarkedVectors && vectorData.isMarked()) {
                    continue;
                }

                vector = vectorData.getByteCoordinates();

//				cosineSimilarity = VectorUtils.computeCosineOfVectors(vector, searchVectorDataBytes);
                similarity = pComparator.computeSimilarity(vector, searchVectorDataBytes);

                //if (similarity >= pMinSimilarityAllowed)
                if (pComparator.isFirstSimilarityBiggerOrEqual(similarity, pMinSimilarityAllowed)) {
                    vectorResult = new TreeResult();
//					vectorResult.mSearchName = pSearchVectorData.getName();
                    vectorResult.setPositionInVectorList(i);
                    vectorResult.similarity = similarity;
                    vectorResult.foundVectorData = vectorData;

                    insertionPoint = Collections.binarySearch(vectorResultList,
                            vectorResult,
                            pComparator);

                    if (insertionPoint < 0) {
                        insertionPoint = -insertionPoint - 1;
                    }

                    vectorResultList.add(insertionPoint, vectorResult);

                    vectorResultListSize = vectorResultList.size();
                    if (pMaxResults < vectorResultListSize) {
                        vectorResultList.remove(vectorResultListSize - 1);
                    }

                    //pMinSimilarityAllowed = (double)((VqSearchResult)(vectorResultList.get(vectorResultList.size() - 1))).getSimilarity();
                }
            }

            int vectorResultListLastIndex = vectorResultList.size() - 1;

            TreeResult lastVectorResult = vectorResultList.get(vectorResultListLastIndex);

//			Since we are always inserting before the last one,
//			there is a possibility of the last index to still contain the dummy vector result
            if (-1 == lastVectorResult.positionInResultsList) {
                vectorResultList.remove(vectorResultListLastIndex);
            }


        } catch (Exception e) {
            System.out.println("------------------------------------");
            System.out.println("PETE en: obtainByteVectorSimilarities  ... " + e.toString());
            System.out.println("------------------------------------");
            e.printStackTrace();
        }

//		queryTimeMonitor.stop();
        return vectorResultList;
    }

    public List<TreeResult> obtainSimilarChildren(VectorData4Tree pSearchVectorData,
                                                  List<VectorData4Tree> pVectorDataList,
                                                  int pMaxResults,
                                                  int pStartPos,
                                                  int pEndPos,
                                                  double pMinSimilarityAllowed,
                                                  VsComparisonCriteriaHandler pComparator) {

        if (null == pSearchVectorData) {
            return new ArrayList<TreeResult>();
        }

        int insertionPoint = -1;
        int numVectors = pVectorDataList.size();
        TreeResult vectorResult = new TreeResult();
        List<TreeResult> vectorResultList = new ArrayList<TreeResult>();

        int startPos = 0;
        int endPos = numVectors - 1;

        try {
            // Validate start and end positions
            if (pStartPos <= pEndPos) {
                if (pStartPos >= 0 && pStartPos < pVectorDataList.size() - 1) {
                    startPos = pStartPos;
                } else {
//					System.out.println(" ** Error in Start Pos Params");
                }

                if (pEndPos >= 0 && pEndPos < pVectorDataList.size()) {
                    endPos = pEndPos;
                } else {
//					System.out.println(" ** Error in End Pos Params");
                }
            } else {
                System.out.println(" ** Error in Start vs End Pos Params");
            }

            vectorResult.similarity = pComparator.minSimilarityValue;
//			Add a dummy vector result for the comparison
            vectorResultList.add(0, vectorResult);
            double similarity = vectorResultList.get(0).similarity;
            VectorData4Tree vectorData = null;
            byte[] vector = null;
            int vectorResultListSize = -1;
            byte[] searchVectorDataBytes = pSearchVectorData.getByteCoordinates();

            for (int i = startPos; i < endPos + 1; i++) {
                vectorData = pVectorDataList.get(i);
                if (null == vectorData) {
                    continue;
                }

                vector = vectorData.getByteCoordinates();

                similarity = pComparator.computeSimilarity(vector, searchVectorDataBytes);

                // Dealing with ref vector vs
                VectorSpace refVector_vs = vectorData.getVectorSpace();

                // Comparing... if (similarity >= pMinSimilarityAllowed)

                // if it is a ref vector...
                if (null != refVector_vs) {
                    // TODO: next line has to be replaced. The addition only works for distances. !!! Implement operations in comparators.
                    double significantDistance = pMinSimilarityAllowed + vectorData.getVectorSpace().getMaxChildDistanceToRefVector();
                    if (pComparator.isFirstSimilarityBiggerOrEqual(similarity, significantDistance)) {
                        vectorResult = new TreeResult();
                        //					vectorResult.mSearchName = pSearchVectorData.getName();
                        vectorResult.setPositionInVectorList(i);
                        vectorResult.similarity = similarity;
                        vectorResult.foundVectorData = vectorData;

                        insertionPoint = Collections.binarySearch(vectorResultList,
                                vectorResult,
                                pComparator);

                        if (insertionPoint < 0) {
                            insertionPoint = -insertionPoint - 1;
                        }

                        vectorResultList.add(insertionPoint, vectorResult);

                        vectorResultListSize = vectorResultList.size();
                        if (pMaxResults < vectorResultListSize) {
                            vectorResultList.remove(vectorResultListSize - 1);
                        }

                        //pMinSimilarityAllowed = (double)((VqSearchResult)(vectorResultList.get(vectorResultList.size() - 1))).getSimilarity();
                    }

                } else {
//					// if it is a final (child) vector...
//					VectorData child = parentResult.getFoundVectorData().getVectorSpace().get(childPos);
//
//					// If distance to parent suitable, consider it:
//					// If distance to parent is bigger than distance to parent of the searched vector minus the searched distance.
//					// child.getDistanceToParent() >= (parentResult.getSimilarity() - pMinSimilarityAllowed)
//					// TODO: Implement subtraction and addition in the comparators. Next "if" only works with distances.
//					double significantDistance = child.getDistanceToParent() + pMinSimilarityAllowed;
//					if (comparator.isFirstSimilarityBiggerOrEqual( parentResult.getSimilarity(), significantDistance  ) ) {
//
//						// Compare the vectors ...
//						sim = comparator.computeSimilarity(child.getByteCoordinates(), pSearchVectorData.getByteCoordinates());
//
//						if (comparator.isFirstSimilarityBiggerOrEqual(sim, pMinSimilarityAllowed)) {
//							// Add child to the results
//							VqSearchResult newResult = new VqSearchResult();
//							newResult.setFoundVectorData( child );
//							newResult.setSimilarity(sim);
//							results.add( newResult );
//
//						}
//
//						comparedRecords++;
//					} else {
//						disRegardedVectorsDueToDistance++;
//					}

                }

            }

            int vectorResultListLastIndex = vectorResultList.size() - 1;

            TreeResult lastVectorResult = vectorResultList.get(vectorResultListLastIndex);

//			Since we are always inserting before the last one,
//			there is a possibility of the last index to still contain the dummy vector result
            if (-1 == lastVectorResult.positionInResultsList) {
                vectorResultList.remove(vectorResultListLastIndex);
            }


        } catch (Exception e) {
            System.out.println("------------------------------------");
            System.out.println("PETE en: obtainByteVectorSimilarities  ... " + e.toString());
            System.out.println("------------------------------------");
        }

        return vectorResultList;
    }

    public List<TreeResult> treeSearchChildren(
            VectorData4Tree pSearchVectorData,
            VectorSpace pRefVectorsVs,
            int pMaxResults,
            double pMinSimilarityAllowed,
            boolean pShowLogs) throws Exception {

        List<TreeResult> resultList = treeFilter(pSearchVectorData,
                pRefVectorsVs,
                pMaxResults,
                pMinSimilarityAllowed,
                pShowLogs);

        // Delete the PARENTS from the results list.
        removeElements(resultList, true);


        // order results.
        VsComparisonCriteriaHandler comparator = pRefVectorsVs.getComparator();
        Collections.sort(resultList, comparator);


        // TODO: trim the last n elements, leaving only pMaxResults elements.
        // This is not important


        return resultList;
    }

    public List<TreeResult> treeSearchParents(
            VectorData4Tree pSearchVectorData,
            VectorSpace pRefVectorsVs,
            int pMaxResults,
            double pMinSimilarityAllowed,
            boolean pShowLogs) throws Exception {

        List<TreeResult> resultList = treeFilter(pSearchVectorData,
                pRefVectorsVs,
                pMaxResults,
                pMinSimilarityAllowed,
                pShowLogs);

//		Delete the children from the results list.
        removeElements(resultList, false);

        // Fill the similarity field in the results
        compareWithAllTheResults(resultList, pSearchVectorData, pRefVectorsVs.getComparator());

//		order results.
        VsComparisonCriteriaHandler comparator = pRefVectorsVs.getComparator();
        Collections.sort(resultList, comparator);


//		TODO: trim the last n elements, leaving only pMaxResults elements.
//		This is not important


        return resultList;
    }

    private void compareWithAllTheResults(
            List<TreeResult> resultList,
            VectorData4Tree pSearchVectorData,
            VsComparisonCriteriaHandler pComparator) throws Exception {

        double similarity = 0;
        TreeResult currentResult = null;

        for (int i = 0; i < resultList.size(); i++) {
            currentResult = resultList.get(i);
            similarity = pComparator.computeSimilarity(
                    pSearchVectorData.getByteCoordinates(),
                    currentResult.getFoundVectorData().getByteCoordinates());
            currentResult.setSimilarity(similarity);
        }

    }

    private List<TreeResult> removeElements(
            List<TreeResult> pResultList,
            boolean pRemoveParents) {

        for (int i = pResultList.size() - 1; i >= 0; i--) {
            if (pRemoveParents) {
                // Removing parents
                if (null != pResultList.get(i).getFoundVectorData().getVectorSpace()) {
                    pResultList.remove(i);
                }
            } else {
                // Removing children
                if (null == pResultList.get(i).getFoundVectorData().getVectorSpace()) {
                    pResultList.remove(i);
                }
            }
        }

        return pResultList;
    }

    /**
     * Recursively traversing a tree of organized vectors
     *
     * @param pSearchVectorData
     * @param pRefVectorsVs
     * @param pMaxResults
     * @param pMinSimilarityAllowed
     * @param pIgnoreRadious
     * @param pReturnAlsoParents
     * @return A list of tree results
     * @throws Exception
     */
    public List<TreeResult> recursiveTreeSearch(VectorData4Tree pSearchVectorData,
                                                VectorSpace pRefVectorsVs,
                                                int pMaxResults,
                                                double pMinSimilarityAllowed,
                                                double pIgnoreRadious,
                                                boolean pReturnAlsoParents) throws Exception {
        List<TreeResult> resultList = new ArrayList<TreeResult>();
        boolean isParent = false;
        double distanceRange = 0;
        boolean skipFurtherChecking = false;

        VsComparisonCriteriaHandler comp = pRefVectorsVs.getComparator();


//		logger.info("pSearchVectorData.getData(): " + pSearchVectorData.getData());
//		logger.info("pSearchVectorData.getDistanceToParent(): " + pSearchVectorData.getDistanceToParent());
//		logger.info("pMinSimilarityAllowed: " + pMinSimilarityAllowed);
//		logger.info("pIgnoreRadious: " + pIgnoreRadious);

        for (int i = 0; i < pRefVectorsVs.size(); i++) {
            VectorData4Tree currentRefVector = pRefVectorsVs.get(i);
            skipFurtherChecking = false;

            isParent = currentRefVector.getVectorSpace() != null;


            // if (!isParent) {
            //		if parent distance to granpa is smaller than the significant radious
            //			AND
            //		if distancia al padre es menor que la diferencia de los dos anteriores:
            //			THEN it is a clear match! Keep it sin further comparisons. (saves computing)
            // }

            // if child, it is a direct match, without need to compare.
            // NOTE: TODO: check if this case is really fulfilled at any point. Even if fulfilled, check how often. Maybe it does not pay (equilibrium of computing saving with provability).
            if (!isParent) {
                if (comp.isFirstSimilarityBiggerOrEqual(
                        pIgnoreRadious,
                        comp.getMaxSimilarityValue())) {
                    if (comp.isFirstSimilarityBiggerOrEqual(
                            currentRefVector.getDistanceToParent(),
                            Math.abs(pIgnoreRadious))) {
                        TreeResult childResult = new TreeResult();
                        childResult.setFoundVectorData(currentRefVector);
                        // TODO: decide what to do with the sim value... compare and set it??
                        childResult.setSimilarity(-1f);
                        resultList.add(childResult);
                        skipFurtherChecking = true;
//							System.out.println("\t-- skipFurtherChecking");
                    }
                }
            }

            if (!skipFurtherChecking) {
                distanceRange = 0;

                if (isParent) {
                    distanceRange = currentRefVector.getVectorSpace().getMaxChildDistanceToRefVector();
                } else {
                    distanceRange = 0;
                }

                // Taking similarity as distance=0 (other comparators behave differently).
                // When parent: if  vs.maxDistToChild() + distToParent >= ignoreRadious.
                // When child : if  distToParent >= ignoreRadious.
                //
                // Meaning, if this vector is in range for a (possible) hit (when parent, if a child of this parent could be in range).
                if (comp.isFirstSimilarityBiggerOrEqual(
                        pIgnoreRadious,
                        comp.incSim_ReduceSeparation(distanceRange, currentRefVector.getDistanceToParent()))) {

                    double distToRef = pRefVectorsVs.obtainSimilarity(
                            currentRefVector,
                            pSearchVectorData);

                    // Measuring how many vectors we compare
                    incCounter();

                    if (comp.isFirstSimilarityBiggerOrEqual(
                            comp.redSim_IncreaseSeparation(distToRef, distanceRange),
                            pMinSimilarityAllowed)
                    ) {

                        // if parent
                        if (isParent) {

                            if (pReturnAlsoParents) {
                                TreeResult parentResult = new TreeResult();
                                parentResult.setFoundVectorData(currentRefVector);
                                parentResult.setSimilarity(distToRef);
                                resultList.add(parentResult);
                            }

                            resultList.addAll(
                                    recursiveTreeSearch(pSearchVectorData,
                                            currentRefVector.getVectorSpace(),
                                            pMaxResults,
                                            pMinSimilarityAllowed,
                                            comp.redSim_IncreaseSeparation(distToRef, pMinSimilarityAllowed),
                                            pReturnAlsoParents));

                        } else {
                            // if child
                            TreeResult childResult = new TreeResult();
                            childResult.setFoundVectorData(currentRefVector);
                            childResult.setSimilarity(distToRef);
                            resultList.add(childResult);
                        }
                    }


                }
            } // end of if skip-further-checking

        }


        return resultList;
    }

    /**
     * Recursively traversing a tree of organized vectors
     *
     * @param pSearchVectorData
     * @param pRefVectorsVs
     * @param pMaxResults
     * @param pMinSimilarityAllowed
     * @param pGivenNearBoundary
     * @param pGivenFarBoundary
     * @return A list of tree results
     * @throws Exception
     */
    public List<TreeResult> recursiveTreeSearch_new(VectorData4Tree pSearchVectorData,
                                                    VectorSpace pRefVectorsVs,
                                                    int pMaxResults,
                                                    double pMinSimilarityAllowed,
                                                    double pGivenNearBoundary,
                                                    double pGivenFarBoundary
    ) throws Exception {

        // If we are operating in a space with seeds, create the vector
        VectorData4Tree searchVectorData = null;
        if (null != pRefVectorsVs.getByteArraySeedingList()) {
            searchVectorData = pRefVectorsVs.createVector(pSearchVectorData.getData(), pRefVectorsVs.getOriginalComparatorWhenTraining());
        } else {
            searchVectorData = pSearchVectorData;
        }


        List<TreeResult> resultList = new ArrayList<TreeResult>();
        VsComparisonCriteriaHandler comp = pRefVectorsVs.getComparator();
        double sim = 0d;

        // Hierarchy_utils.logLine(Hierarchy_utils.log, "######### recursiveTreeSearch_new : " + pSearchVectorData.getData());

        for (int i = 0; i < pRefVectorsVs.size(); i++) {

            // Grabbing the vector
            VectorData4Tree currentVector = pRefVectorsVs.get(i);
            boolean isParent = false;
            if (null != currentVector.getVectorSpace()) {
                isParent = true;
            }


            // if it is a ref vector
            if (isParent) {
                // Hierarchy_utils.logLine(Hierarchy_utils.log, "[PARENT] - currentVector= " + currentVector.getData() );

                double maxChildDistance = currentVector.getVectorSpace().getMaxChildDistanceToRefVector();

                // computing similarity
                sim = comp.computeSimilarity(searchVectorData.getByteCoordinates(), currentVector.getByteCoordinates());

                incCounter();

                // Hierarchy_utils.logLine(Hierarchy_utils.log, "\tsim=" + sim);

                // TODO: use the given lower and upper bounds.
                // farBoundary  = less similar
                // nearBoundary = more similar
                double nearBoundary = comp.incSim_ReduceSeparation(sim, pMinSimilarityAllowed);
                double farBoundary = comp.redSim_IncreaseSeparation(sim, pMinSimilarityAllowed);
                boolean isFarerThanNearBoundary = comp.isFirstSimilarityBiggerOrEqual(nearBoundary, maxChildDistance);
                boolean isCloserThanFarBoundary = comp.isFirstSimilarityBiggerOrEqual(maxChildDistance, farBoundary);

                // Hierarchy_utils.logLine(Hierarchy_utils.log, "\tmaxChildDistance=" + maxChildDistance );
                // Hierarchy_utils.logLine(Hierarchy_utils.log, "\tfarBoundary=" + farBoundary + "\tnearBoundary=" + nearBoundary);
                // Hierarchy_utils.logLine(Hierarchy_utils.log, "\tisFarerThanNearBoundary=" + isFarerThanNearBoundary + "\tisCloserThanFarBoundary=" + isCloserThanFarBoundary);

                // if this ref vector has things in the range
                if (isFarerThanNearBoundary) {
                    // descend the tree searching on the children
                    List<TreeResult> partialResultList = recursiveTreeSearch_new(
                            searchVectorData,
                            currentVector.getVectorSpace(),
                            pMaxResults,
                            pMinSimilarityAllowed,
                            nearBoundary,
                            farBoundary
                    );

                    resultList.addAll(partialResultList);
                }

            } else {
                // if it is a child vector

                // first we check the given boundaries. Quite possible, the vector does not meet the proximity criteria
                double proximityToParent = currentVector.getDistanceToParent();

                // Hierarchy_utils.logLine(Hierarchy_utils.log, "[CHILD] - currentVector= " + currentVector.getData() + "\tproximityToParent=" + proximityToParent);

                boolean isCloserThanFarBoundary = comp.isFirstSimilarityBiggerOrEqual(proximityToParent, pGivenFarBoundary);
                boolean isFarerThanNearBoundary = comp.isFirstSimilarityBiggerOrEqual(pGivenNearBoundary, proximityToParent);

                // Hierarchy_utils.logLine(Hierarchy_utils.log, "\tpGivenNearBoundary=" + pGivenNearBoundary + "\tpGivenFarBoundary=" + pGivenFarBoundary);
                // Hierarchy_utils.logLine(Hierarchy_utils.log, "\tisCloserThanFarBoundary=" + isCloserThanFarBoundary + "\tisFarerThanNearBoundary=" + isFarerThanNearBoundary);

                if (isCloserThanFarBoundary && isFarerThanNearBoundary) {

                    // computing similarity
                    sim = comp.computeSimilarity(searchVectorData.getByteCoordinates(), currentVector.getByteCoordinates());

                    incCounter();

                    // Hierarchy_utils.logLine(Hierarchy_utils.log, "\t** sim=" + sim);

                    if (comp.isFirstSimilarityBiggerOrEqual(sim, pMinSimilarityAllowed)) {
                        // Hierarchy_utils.logLine(Hierarchy_utils.log, "\t***** MATCH! ****************");
                        TreeResult newResult = new TreeResult();
                        newResult.setFoundVectorData(currentVector);
                        newResult.setSimilarity(sim);
                        resultList.add(newResult);
                    }
                }
            }

        }

        // Hierarchy_utils.logLine(Hierarchy_utils.log, "<<<<<<<<<<<<<");

        return resultList;
    }

    public List<TreeResult> fineFilter(VectorData4Tree pSearchVectorData,
                                       VectorSpace pTrainedVs,
                                       List<TreeResult> pResultToFilter,
                                       double pMinSimilarityAllowed) throws Exception {

        List<TreeResult> resultList = new ArrayList<TreeResult>();
        VsComparisonCriteriaHandler comp = pTrainedVs.getComparator();

        for (int i = 0; i < pResultToFilter.size(); i++) {
            double sim = pTrainedVs.obtainSimilarity(pResultToFilter.get(i).getFoundVectorData(), pSearchVectorData);
            if (comp.isFirstSimilarityBiggerOrEqual(sim, (float) pMinSimilarityAllowed)) {
                resultList.add(pResultToFilter.get(i));
            }
        }

        return resultList;
    }

    // the search prototype
    public List<TreeResult> treeFilter(VectorData4Tree pSearchVectorData,
                                       VectorSpace pRefVectorsVs,
                                       int pMaxResults,
                                       double pMinSimilarityAllowed,
                                       boolean pShowLogs) throws Exception {

        VsComparisonCriteriaHandler comparator = pRefVectorsVs.getComparator();

//		if (!comparator.getCriteriaName().equalsIgnoreCase("DISTANCE_NORMALIZED")) {
//			throw new Exception("treeSearch : using wrong comparator for the search. Distance normalized is needed by now.");
//		}

        List<TreeResult> resultList = new ArrayList<TreeResult>();
        List<TreeResult> tempResultList = null;

        long startTime = System.currentTimeMillis();

        for (int i = 0; i < pRefVectorsVs.size(); i++) {
            TreeResult seedingParent = new TreeResult();
            seedingParent.setFoundVectorData(pRefVectorsVs.get(i));

            // TODO: The following two lines can be avoided either here or later (it is computed twice)
            double sim = pRefVectorsVs.obtainSimilarity(pRefVectorsVs.get(i), pSearchVectorData);
            seedingParent.setSimilarity(sim);

            resultList.add(seedingParent);
        }


        if (pShowLogs) {
            long stopTime = System.currentTimeMillis();
            Hierarchy_utils.logLine(Hierarchy_utils.log, "\t-First pass to retrieveSimilarChildren(), time = " + (stopTime - startTime) + " ms \tretrieved: " + resultList.size() + " elements.");
        }

        // For each vector returned (at the beginning just parents...)
        // this list gets growing constantly as new results are found
        int count = 0;
        while (count < resultList.size()) {

            TreeResult resultToAnalyze = resultList.get(count);

            VectorSpace vsToSearch = resultToAnalyze.getFoundVectorData().getVectorSpace();

            // If it is a parent ref vector...
            if (null != vsToSearch) {

                if (pShowLogs) {
                    Hierarchy_utils.logLine(Hierarchy_utils.log,
                            "\t\t-Loop pass: " + count + " / " + resultList.size() +
                                    " ... PARENT FOUND (" + resultList.get(count).getFoundVectorData().getData() + ")");
                }

                tempResultList = this.retrieveSimilarChildren(
                        pSearchVectorData,
                        resultList.get(count).getFoundVectorData(),
                        pMinSimilarityAllowed,
                        comparator);


                resultList.addAll(tempResultList);

                if (pShowLogs && tempResultList.size() > 0) {
                    Hierarchy_utils.logLine(Hierarchy_utils.log, "\t\t* adding: " + tempResultList.size() + " elements . now in pass: " + count + " / " + resultList.size());
                }

            } else {
                if (pShowLogs) {
                    Hierarchy_utils.logLine(Hierarchy_utils.log,
                            "\t\t-Loop pass: " + count + " / " + resultList.size() +
                                    " ... ---- CHILD FOUND (" + resultToAnalyze.getFoundVectorData().getData() + ") SIM=" + resultToAnalyze.getSimilarity());
                }
            }
            count++;
        }


        return resultList;
    }

    private List<TreeResult> retrieveSimilarChildren(VectorData4Tree pSearchVectorData,
                                                     VectorData4Tree pParentVectorData,
                                                     double pMinSimilarityAllowed,
                                                     VsComparisonCriteriaHandler pComparator) throws Exception {

        if (null == pSearchVectorData) {
            return null; // TODO: check if this is ok. It could be necessary to return a empty list instead.
        }

//		if (!pComparator.getCriteriaName().equalsIgnoreCase("DISTANCE_NORMALIZED")) {
//			throw new Exception("treeSearch : using wrong comparator for the search. Distance normalized is needed by now.");
//		}


        List<TreeResult> resultsListToReturn = new ArrayList<TreeResult>();


        double parentSimilarity = pComparator.computeSimilarity(
                pParentVectorData.getByteCoordinates(),
                pSearchVectorData.getByteCoordinates());


        double childSim = 0;

        // Dealing with ref vector vs
        VectorSpace parentRefVector_vs = pParentVectorData.getVectorSpace();

        // if the provided vector is already a child one (this should only happen in the first layer. Afterwards, they are filtered)
        if (null == parentRefVector_vs) {
            childSim = parentSimilarity;
//			// Compare the vectors ...
//			childSim = pComparator.computeSimilarity(
//										pParentVectorData.getByteCoordinates(),
//										pSearchVectorData.getByteCoordinates());

            if (pComparator.isFirstSimilarityBiggerOrEqual(parentSimilarity, pMinSimilarityAllowed)) {
                addChildToResults(resultsListToReturn, pParentVectorData, parentSimilarity, null);
            }

        } else {
            // Browsing all the children
            for (int i = 0; i < parentRefVector_vs.size(); i++) {
                VectorData4Tree child = parentRefVector_vs.get(i);

                // if the child is a parent as well
                if (null != child.getVectorSpace()) {

                    if (DEBUG_LOG) {
                        Hierarchy_utils.logLine(Hierarchy_utils.log, "\t\t\t- reviewing child-REF: " + child.getData(), false);
                    }

//					if (child.getData().equals("TRA VAN")) {
//						childSim = childSim * 1d;
//					}

                    // TODO: next line has to be replaced. The addition only works for distances. !!! Implement operations in comparators.
//					double significantDistance = pMinSimilarityAllowed
//												 + child.getVectorSpace().getMaxChildDistanceToRefVector()
//												 + child.getDistanceToParent();
//					if (pComparator.isFirstSimilarityBiggerOrEqual(parentSimilarity, significantDistance)  )

                    if (pParentVectorData.getData().equals(pSearchVectorData.getData())) {
                        if (parentSimilarity != 0d) {
                            int ss = 1;
                            ss++;
                        }
                    }

                    double significantDistance = parentSimilarity
                            - child.getVectorSpace().getMaxChildDistanceToRefVector()
                            - child.getDistanceToParent();
                    if (pComparator.isFirstSimilarityBiggerOrEqual(significantDistance, pMinSimilarityAllowed)) {
                        addChildToResults(resultsListToReturn, child, pComparator.getMinSimilarityValue(), pParentVectorData);

                        if (DEBUG_LOG) {
                            Hierarchy_utils.logLine(Hierarchy_utils.log, " -DISTANCE SIGNIFICANT-", false);
                        }
                    } else {
                        if (DEBUG_LOG) {
                            Hierarchy_utils.logLine(Hierarchy_utils.log, " -DISTANCE TOO_FAR-", false);
                            Hierarchy_utils.logLine(Hierarchy_utils.log,
                                    "\t" + parentSimilarity +
                                            " - " + child.getVectorSpace().getMaxChildDistanceToRefVector() +
                                            " - " + child.getDistanceToParent() +
                                            " > " + pMinSimilarityAllowed, false);
                            Hierarchy_utils.logLine(Hierarchy_utils.log, "\tComparing: " + pParentVectorData.getData() + " / " + pSearchVectorData.getData(), false);
                        }
                    }

                } else {
                    // if the child is not a parent
                    //Compare the distance to discriminate

                    if (DEBUG_LOG) {
                        Hierarchy_utils.logLine(Hierarchy_utils.log, "\t\t\t- reviewing child-final: " + child.getData(), false);
                    }

                    //				If distance to parent suitable, consider it:
                    //				If distance to parent is bigger than distance to parent of the searched vector minus the searched distance.
                    //				child.getDistanceToParent() >= (resultToAnalyze.getSimilarity() - pMinSimilarityAllowed)
                    //				TODO: Implement subtraction and addition in the comparators. Next "if" only works with distances.
                    double significantDistance = pMinSimilarityAllowed + child.getDistanceToParent();
                    if (pComparator.isFirstSimilarityBiggerOrEqual(parentSimilarity, significantDistance)) {

                        if (DEBUG_LOG) {
                            Hierarchy_utils.logLine(Hierarchy_utils.log, " -distance significant-", false);
                        }

                        // Compare the vectors ...
                        childSim = pComparator.computeSimilarity(child.getByteCoordinates(), pSearchVectorData.getByteCoordinates());

                        if (pComparator.isFirstSimilarityBiggerOrEqual(childSim, pMinSimilarityAllowed)) {
                            // Add child to the results
//							VqSearchResult newResult = new VqSearchResult();
//							newResult.setSimilarity(childSim);
//							newResult.setFoundVectorData( child );
//							resultsListToReturn.add( newResult );

                            addChildToResults(resultsListToReturn, child, childSim, pParentVectorData);

                            if (DEBUG_LOG) {
                                Hierarchy_utils.logLine(Hierarchy_utils.log, " -high sim-", false);
                            }
                        } else {
                            if (DEBUG_LOG) {
                                Hierarchy_utils.logLine(Hierarchy_utils.log, " -low sim-", false);
                            }
                        }


                    } else {
                        if (DEBUG_LOG) {
                            Hierarchy_utils.logLine(Hierarchy_utils.log, " -distance too_far -", false);
                        }
                    }

                }

                if (DEBUG_LOG) {
                    Hierarchy_utils.logLine(Hierarchy_utils.log, "");
                }
            }
        }


        return resultsListToReturn;
    }

    /**
     * Return the vd from the result list.
     *
     * @param pVectorResultList The vector result list
     * @return The VectoData
     */
    public List<VectorData4Tree> obtainVdFromResultsList(List<TreeResult> pVectorResultList) {
        VectorData4Tree vectorData = null;
        List<VectorData4Tree> filteredVectorDataList = new ArrayList<VectorData4Tree>();

        for (int i = 0; i < pVectorResultList.size(); i++) {
            TreeResult vectorResult = pVectorResultList.get(i);
            vectorData = vectorResult.getFoundVectorData();
            filteredVectorDataList.add(vectorData);
        }

        return filteredVectorDataList;
    }


    /**
     * Caracteriza los bytes de un patr�n con los datos pasados
     */
    public byte[] diffBytesShape(byte[] pBytesToMod,
                                 byte[] pBytesOfVector,
                                 long pWeightCounterOfBytes2Mod,
                                 byte[] pBytesCaracteristica,
                                 boolean pRewardMethod,
                                 double pSimilarity) {
        byte[] cosineBytes = new byte[pBytesToMod.length];
        int byteDiff = 0;
        int byteSignificance = 0;
        double byteVal = 0;

        //VectorData weightPattern2Mod = pVector2Mod.getWeightPatterns().get(pPosOfPatternToMod);

        for (int i = 0; i < pBytesToMod.length; i++) {
            byteDiff = Math.abs(pBytesOfVector[i]) - Math.abs(pBytesCaracteristica[i]);
            byteDiff = Math.abs(byteDiff);

            // decides if it rewards or punishes the differences
            if (pRewardMethod) {
                byteSignificance = 100 - byteDiff;
            } else {
                byteSignificance = byteDiff - 100;
            }

            byteVal = pBytesToMod[i] * pWeightCounterOfBytes2Mod + byteSignificance;
            byteVal = byteVal / (pWeightCounterOfBytes2Mod + 1);

            cosineBytes[i] = (byte) (Math.round(byteVal));
        }


        return cosineBytes;
    }


}