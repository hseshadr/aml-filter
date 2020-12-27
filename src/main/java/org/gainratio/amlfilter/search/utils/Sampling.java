package org.gainratio.amlfilter.search.utils;


import org.gainratio.amlfilter.search.comparisonCriteria.VsComparisonCriteriaHandler;
import org.gainratio.amlfilter.search.vectorSpace.TreeResult;
import org.gainratio.amlfilter.search.vectorSpace.VectorData4Tree;
import org.gainratio.amlfilter.search.vectorSpace.VectorSpace;

import java.util.ArrayList;
import java.util.List;


public class Sampling {

    /**
     * @param args
     */
    public static void main(String[] args) {
        // TODO Auto-generated method stub

    }

    public final static byte[][] buildRandomSample(byte[][] pDataArray, int pSampleSize) {

        if (pDataArray[0].length == 0
                ||
                pSampleSize >= pDataArray.length
                ||
                (
                        (pSampleSize > 50000)
                                &&
                                (float) (pSampleSize / pDataArray.length) > 0.5f
                )
                ||
                (float) (pSampleSize / pDataArray.length) > 0.9f
        ) {
            // Protects the method from taking a long time
            System.out.println("buildRandomSample -> the parameters could take a long time. Exiting... (returning null)");
            return null;
        }

        byte[][] retVal = new byte[pSampleSize][pDataArray[0].length];

        int randomPos = 0;

        boolean[] takenArray = new boolean[pDataArray.length];

        int count = 0;
        while (count < pSampleSize) {
            randomPos = (int) (Math.random() * pDataArray.length);
            if (!takenArray[randomPos]) {
                retVal[count] = pDataArray[randomPos];
                count++;
            }
        }

        return retVal;
    }

    public final static List<VectorData4Tree> buildRandomSample(VectorSpace pVectorSpace,
                                                                int pSampleSize,
                                                                boolean pCloneItemsToReturnNewElements,
                                                                boolean pClearChildVectorSpaces) throws Exception {

        int availableVectors = pVectorSpace.countMarkedVectorsInList();

        if (availableVectors == 0) {
            int i = 0;
            i++;
        }

        if (availableVectors == 0
                ||
                pSampleSize >= availableVectors
                ||
                (
                        (pSampleSize > 50000)
                                &&
                                (float) (pSampleSize / availableVectors) > 0.5f
                )
                ||
                (float) (pSampleSize / availableVectors) > 0.9f
        ) {
            // Protects the method from taking a long time
            System.out.println("buildRandomSample -> the parameters could take a long time. Exiting...(" + pSampleSize + " / " + pVectorSpace.size() + " / " + availableVectors + ")");
//			throw new Exception("buildRandomSample -> the parameters could take a long time. Exiting...(" + pSampleSize + " / " + pVectorSpace.size() + ")");
            if (pCloneItemsToReturnNewElements) {
                List<VectorData4Tree> newVectorList = new ArrayList<VectorData4Tree>();
                for (int i = 0; i < pVectorSpace.size(); i++) {
                    VectorData4Tree newVector = pVectorSpace.get(i).clone();
                    newVectorList.add(newVector);

                    if (pClearChildVectorSpaces) {
                        newVector.setVectorSpace(null);
                    }
                }
                return newVectorList;
            } else {
                return pVectorSpace.getVectorList();
            }
        }

        List<VectorData4Tree> retVal = new ArrayList<VectorData4Tree>();

        int randomPos = 0;

        boolean[] takenArray = new boolean[pVectorSpace.size()];

        int count = 0;
        while (count < pSampleSize) {
            randomPos = (int) (Math.random() * pVectorSpace.size());
            if (!takenArray[randomPos] && pVectorSpace.get(randomPos).isMarked()) {

                VectorData4Tree newRefVector = null;

                // If we have to clone the elements to return
                if (pCloneItemsToReturnNewElements) {
                    newRefVector = pVectorSpace.get(randomPos).clone();

                    // If we have to clear the possible children this might have
                    if (pClearChildVectorSpaces) {
                        newRefVector.setVectorSpace(null);
                    }

                } else {
                    newRefVector = pVectorSpace.get(randomPos);
                }

                // un-mark the vector: it was used
//				pVectorSpace.get(randomPos).unsetMark();

                retVal.add(newRefVector);
                count++;
            }
        }

        return retVal;
    }


    public final static VectorData4Tree chooseRandomVector(List<VectorData4Tree> pListOfVectors, boolean pSkipMarkedVectors) throws Exception {

        int randomPos = (int) (Math.random() * pListOfVectors.size());

        if (pSkipMarkedVectors && pListOfVectors.get(randomPos).isMarked()) {
            randomPos = getNextNotMarkedVector(pListOfVectors, randomPos);
        } else {
            return pListOfVectors.get(randomPos);
        }

        return pListOfVectors.get(randomPos);
    }

    private final static int getNextNotMarkedVector(List<VectorData4Tree> pListOfVectors, int pOriginPos) throws Exception {
        int pos = pOriginPos;
        boolean notFound = true;
        int count = 0;

        if (pListOfVectors == null || pListOfVectors.size() == 0) {
            throw new Exception("getNextNotMarkedVector : empty list of vectors.");
        }

        while (notFound && count < pListOfVectors.size() + 1) {
            pos++;
            if (pos > pListOfVectors.size() - 1) {
                pos = 0;
            }

            if (pListOfVectors.get(pos).isMarked()) {
                notFound = false;
            }

            count++;
        }

        if (count > pListOfVectors.size()) {
            throw new Exception("getNextNotMarkedVector : all the items seem marked.");
        }

        return pos;
    }

    public final static VectorSpace buildClonedRandomSample(VectorSpace pVectorSpace,
                                                            int pSampleSize,
                                                            boolean pCloneItemsToReturnNewElements,
                                                            boolean pClearChildVectorSpaces) throws Exception {

        VectorSpace retVal = pVectorSpace.cloneFrame();

        retVal.setVectorList(buildRandomSample(pVectorSpace, pSampleSize, pCloneItemsToReturnNewElements, pClearChildVectorSpaces));

        return retVal;
    }

    public static List<VectorData4Tree> retrieveClonedSignificantVectorsFromVs(
            VectorSpace pRawVs,
            double pAvgDistanceRawSpace,
            float pPercentOfSpaceToCover) throws Exception {

        List<VectorData4Tree> retList = new ArrayList<VectorData4Tree>();
        float percentageOfSpaceCovered = 0f;
        int numVectorsCovered = 0;
        VectorData4Tree temptativeVector = null;
        boolean skipMarkedVectors = true;
        double avgSimAroundTemptativeVector = 0;
        VsComparisonCriteriaHandler comparator = pRawVs.getComparator();
        int numSignificantVectors = 0;
        int count = 0;

        pRawVs.markAllVectorsInList();

        while (pPercentOfSpaceToCover > percentageOfSpaceCovered && count < 10000) {
            temptativeVector = chooseRandomVector(pRawVs.getVectorList(), skipMarkedVectors);

            List<TreeResult> res = pRawVs.obtainSimilarResults(
                    temptativeVector,
                    1000,
                    pAvgDistanceRawSpace,
                    false);

            // Compute the avg sim around the vector
            avgSimAroundTemptativeVector = 0;
            numSignificantVectors = 0;
            for (int i = 0; i < res.size(); i++) {
                // Compute the similarity on the not marked ones
                if (!res.get(i).isMarked()) {
                    avgSimAroundTemptativeVector += res.get(i).getSimilarity();
                    numSignificantVectors++;
                }
            }
            avgSimAroundTemptativeVector = avgSimAroundTemptativeVector / (double) numSignificantVectors;

            // If the avg sim is significant
            if (comparator.isFirstSimilarityBiggerOrEqual(avgSimAroundTemptativeVector, pAvgDistanceRawSpace)) {

                // mark the vectors
                for (int i = 0; i < res.size(); i++) {
                    res.get(i).setMark();
                }
                numVectorsCovered += numSignificantVectors;
                percentageOfSpaceCovered = (float) numVectorsCovered / (float) pRawVs.size();

                retList.add(temptativeVector.clone());
            }
            count++;
        }

        if (count > 9999) {
            throw new Exception("retrieveClonedSignificantVectorsFromVs : the selection of ref vectors was not successufull. Too many iterations without results. Exiting.");
        }

        return retList;
    }


}
