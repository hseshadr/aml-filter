package org.gainratio.amlfilter.vector.vectorSpace;

import org.gainratio.amlfilter.vector.comparisonCriteria.VsComparisonCriteriaHandler;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;


public class VectorSpace implements Serializable {

    /**
     *
     */
    private static final long serialVersionUID = -5538776144686243557L;
    /**
     * The vector definition
     */
    VectorDefinition mVectorDefinition = new VectorDefinition();
    /**
     * The vector manager
     */
    VectorManager vectorManager = new VectorManager();
    private List<byte[]> mByteArraySeedingList = null;
    private VsComparisonCriteriaHandler mComparator = null;
    private VsComparisonCriteriaHandler mOriginalComparatorWhenTraining = null;
    private double mTrainSimilarityBoundary = -100f;
    private int mNumberOfPeripheralVectors = 0;
    /**
     * The translation vector list from the original reference to the new one.
     * This list holds the original reference vectors. It should be used to compute the
     * position of the final vectors vs the original ones since the final ones keep
     * on changing position.
     */
    private List<byte[]> mCoordinatesTranslationVectorList = null;
    /**
     * The distance of the farest child
     */
    // TODO: DEBUG. Reset to zero.
    private float mMaxChildDistanceToRefVector = 100f;
    private List<VectorData> mOrphanList = new ArrayList<VectorData>();
    private List<VectorData> mVectorList = new ArrayList<VectorData>();

    public VectorSpace() {
        // Set the basic vector definition. Using raw vector definition.
        setVectorDefinition(VectorDefinition.makeRawVecDefinition());
        setCoordinatesTranslationVectorList(new ArrayList<byte[]>());

//		// Set the default vector manager.
//		setVectorManager	( new VectorManager() );
    }

    public double getTrainSimilarityBoundary() {
        return mTrainSimilarityBoundary;
    }

    public void setTrainSimilarityBoundary(double trainSimilarityBoundary) {
        this.mTrainSimilarityBoundary = trainSimilarityBoundary;
    }

    public int getNumberOfPeripheralVectors() {
        return mNumberOfPeripheralVectors;
    }

    public void setNumberOfPeripheralVectors(int pNumberOfPeripheralVectors) {
        this.mNumberOfPeripheralVectors = pNumberOfPeripheralVectors;
    }

    public void incNumberOfPeripheralVectors() {
        this.mNumberOfPeripheralVectors++;
    }

    /**
     * Adds a new vector translator
     *
     * @param pVectorSize
     */
    private void addEmptyTranslatorVectorArray(int pVectorSize) {
        byte[] newVectorTranslator = new byte[pVectorSize];
        mCoordinatesTranslationVectorList.add(newVectorTranslator);
    }

    /**
     * Creates a vector out of an incoming string and adds it to the space.
     *
     * @param pIncomingData
     * @return
     */
    public boolean addVector(final String pIncomingData) {
        boolean retVal = true;

        try {
            // TODO: for a little performance we can create the vector without the call to the local method ( this.getVectorManager().createVector(this.getVectorDefinition(), pIncomingData) )
            VectorData newVector = createVector(pIncomingData);
            getVectorList().add(newVector);

            addEmptyTranslatorVectorArray(newVector.getByteCoordinates().length);
        } catch (Exception e) {
            retVal = false;
        }

        return retVal;
    }

    /**
     * Adds the VectorData to the space.
     *
     * @param pIncomingVectorData
     * @return
     */
    public boolean addVector(final VectorData pIncomingVectorData) {
        boolean retVal = true;

        try {
            getVectorList().add(pIncomingVectorData);

            addEmptyTranslatorVectorArray(pIncomingVectorData.getByteCoordinates().length);

        } catch (Exception e) {
            retVal = false;
        }

        return retVal;
    }

    /**
     * Adds the VectorData to the space. This overloaded version also sets the parent.
     *
     * @param pIncomingVectorData
     * @return
     */
    public boolean addVector(final VectorData pIncomingVectorData, final VectorData pParentVectorData) {
        boolean retVal = true;

        pIncomingVectorData.setParentVector(pParentVectorData);
        retVal = addVector(pIncomingVectorData);

        return retVal;
    }

    public void addChild(VectorData pParent, VectorData pVectorToAdd) {
        // If no child vs
        if (null == pParent.getVectorSpace()) {
            pParent.setVectorSpace(cloneFrame());
        }

        // Set the parent
        pVectorToAdd.setParentVector(pParent);

        // Add the child
        pParent.getVectorSpace().addVector(pVectorToAdd);
    }

    public void addChild(VectorData pParent, VectorData pVectorToAdd, double pTrainingDistance) {
        addChild(pParent, pVectorToAdd);
        pParent.getVectorSpace().setTrainSimilarityBoundary(pTrainingDistance);
    }

    public void addChild(VectorData pParent, double pSimilarityToParent, VectorData pVectorToAdd) {
        pVectorToAdd.setDistanceToParent((float) pSimilarityToParent);
        addChild(pParent, pVectorToAdd);
        if (getComparator().isFirstSimilarityBiggerOrEqual(pParent.getVectorSpace().getMaxChildDistanceToRefVector(), pSimilarityToParent)) {
            pParent.getVectorSpace().setMaxChildDistanceToRefVector((float) pSimilarityToParent);
        }
    }

    public boolean isFirstVectorMoreCentered(
            VectorData pFirstVector,
            VectorData pSecondVector,
            int pNUMBER_OF_CLOSE_RESULTS_FOR_DENSITY_COMPUTATION,
            double pMinSimilarityAllowed) {
        boolean retVal = false;

//		int i=1;
        // Check to see who represents best the children.

        // Compute the density of this new element
        double densityOfFirstVector = computeDensityAround(
                pFirstVector,
                pMinSimilarityAllowed);

        // Compute the density of the parent (cache the density)
        double densityOfSecondVector = computeDensityAround(
                pSecondVector,
                pMinSimilarityAllowed);

        if (densityOfFirstVector > densityOfSecondVector) {
            retVal = true;
        }

        return retVal;
    }

    public VectorSpace clone() {
        // Calls the method for just cloning the main info on the vs
        VectorSpace newVs = cloneFrame();

        // Recreates the children vectors ...
        List<VectorData> newVectorList = new ArrayList<VectorData>();

        for (int i = 0; i < size(); i++) {
            VectorData newVd = getVectorList().get(i).clone();
            newVectorList.add(newVd);
        }

        newVs.setVectorList(newVectorList);
        // No need to add the translationCoordinates list, it is set when setting the vectors.

        return newVs;
    }

    public VectorSpace cloneFrame() {
        VectorSpace newVs = new VectorSpace();

        newVs.setComparator(getComparator());
        newVs.setOriginalComparatorWhenTraining(getOriginalComparatorWhenTraining());
        newVs.setVectorManager(getVectorManager());
        newVs.setVectorDefinition(getVectorDefinition());
        newVs.setMaxChildDistanceToRefVector(getMaxChildDistanceToRefVector());

        return newVs;
    }

    public final double computeAverageSimilarity(int pRefVector, double pMinSimilarityForDensityComputation) {

        return computeAverageSimilarity(pRefVector, size(), pMinSimilarityForDensityComputation);
    }


    /**
     * Computes the average similarity between a given element and the rest from a collection
     *
     * @param pRefVector            The position of the target vector in the vector list.
     * @param pNumberOfCloseResults The number of close results to consider.
     * @return
     */
    public final double computeAverageSimilarity(int pRefVector, int pNumberOfCloseResults, double pMinSimilarityForDensityComputation) {
        double retVal = 0;

        List<TreeResult> results = obtainSimilarResults(
                getVectorList().get(pRefVector),
                pNumberOfCloseResults,
                pMinSimilarityForDensityComputation,
                false
        );
        int count = 0;

        for (int i = 0; i < results.size(); i++) {
            if (!getVectorList().get(pRefVector).equals(results.get(i).getFoundVectorData())) {
                retVal += results.get(i).similarity;
                count++;
            }
        }

        retVal = retVal / count;

        return retVal;
    }

    /**
     * Computes the average similarity between a given element and the rest from a collection.
     *
     * @param pRefVector            A complete vector element
     * @param pNumberOfCloseResults The number of close results to consider
     * @return
     */
    public final double computeAverageSimilarity(
            VectorData pRefVector,
            int pNumberOfCloseResults,
            double pMinSimilarityForDensityComputation) {
        double retVal = 0;

        List<TreeResult> results = obtainSimilarResults(
                pRefVector,
                pNumberOfCloseResults,
                pMinSimilarityForDensityComputation,
                false
        );

        for (int i = 0; i < results.size(); i++) {
            retVal += results.get(i).similarity;
        }

        retVal = retVal / (double) results.size();

        return retVal;
    }

    // TODO: review this method !!
    public final double computeDensityAround(
            VectorData pRefVector,
            double pMinSimilarityForDensityComputation) {

        // TODO: if vs is big, sample it.

        List<TreeResult> results = obtainSimilarResults(
                pRefVector,
                10000000,
                pMinSimilarityForDensityComputation,
                false
        );
        double retVal = 0;

        // Add the complement of the similarity (closest is bigger)
        for (int i = 0; i < results.size(); i++) {
            // Only use the vector if the result does not match the searched vector
            if (!pRefVector.equals(results.get(i).getFoundVectorData())) {
                retVal += Math.abs(getComparator().getMinSimilarityValue() - results.get(i).getSimilarity());
            }
        }

        return retVal;
    }

    public int countMarkedVectorsInList() {
        int retVal = 0;

        for (int i = 0; i < getVectorList().size(); i++) {
            if (get(i).isMarked()) {
                retVal++;
            }
        }

        return retVal;
    }


    /**
     * Creates a vector using the vector definition and manager of the space.
     *
     * @param pIncomingString
     * @return
     * @throws Exception
     */
    public VectorData createVector(final String pIncomingString) throws Exception {

        //
        String theString = pIncomingString.toUpperCase().trim();

        byte[] theBytes = theString.getBytes(
                getVectorManager().getLocale().getDisplayName()
        );

        return getVectorManager().createVector(
                getVectorDefinition(),
                theBytes
        );
    }

    /**
     * Creates a vector using the vector definition and manager of the space.
     * This overloaded version of the method assumes that it has to compare the vector
     * with all the seeding vectors in the space in order to build the coordinates.
     *
     * @param pIncomingString
     * @param pComparator
     * @return
     * @throws Exception
     */
    public VectorData createVector(final String pIncomingString,
                                   VsComparisonCriteriaHandler pComparator) throws Exception {

        // getVectorManager().getLocale().getDisplayName()
        String upperString = pIncomingString.toUpperCase();
        String trimmedString = upperString.trim();

        // TODO: use the vector definition to create the new vector. Review.
        return getVectorManager().createVector(
                getVectorDefinition(),
                trimmedString.getBytes(getVectorManager().getLocale().getDisplayName()),
                pComparator,
                this
        );
    }

    public VectorData findParentWithZeroMaxDistDrillDown() {

        // drill down recursively
        for (int i = 0; i < getVectorList().size(); i++) {

            if (getMaxChildDistanceToRefVector() == 0) {
                return get(i);
            }

            if (get(i).getVectorSpace() != null) {
                get(i).getVectorSpace().findParentWithZeroMaxDistDrillDown();
                // retVal = (anterior)
                // If diff than null, return it.
            }
        }

        return null;
    }

    public VectorData get(int pPosition) {
        return mVectorList.get(pPosition);
    }

    public List<byte[]> getByteArraySeedingList() {
        return mByteArraySeedingList;
    }

    public void setByteArraySeedingList(List<byte[]> byteArraySeedingList) {
        this.mByteArraySeedingList = byteArraySeedingList;
    }

    public VsComparisonCriteriaHandler getComparator() {
        return mComparator;
    }

    public void setComparator(VsComparisonCriteriaHandler compareCriteria) {
        mComparator = compareCriteria;
    }

    /**
     * Returns the coordinates translator vector list.
     *
     * @return
     */
    public List<byte[]> getCoordinatesTranslationVectorList() {

        // Making sure the size of the translator vector list is the right one.
        if (mCoordinatesTranslationVectorList.size() != getVectorList().size()) {
            // Since there is a mismatch, we return null.
            return null;
        }

        return mCoordinatesTranslationVectorList;
    }

    /**
     * Sets the coordinates translator vector list.
     *
     * @param pCoordinatesTranslationVector
     */
    public void setCoordinatesTranslationVectorList(List<byte[]> pCoordinatesTranslationVector) {
        this.mCoordinatesTranslationVectorList = pCoordinatesTranslationVector;
    }

    /**
     * @return
     */
    public float getMaxChildDistanceToRefVector() {
        return mMaxChildDistanceToRefVector;
    }

    /**
     * @param pMaxChildDistanceToRefVector
     */
    public void setMaxChildDistanceToRefVector(float pMaxChildDistanceToRefVector) {
        this.mMaxChildDistanceToRefVector = pMaxChildDistanceToRefVector;
    }

    public List<VectorData> getOrphanList() {
        return mOrphanList;
    }

    public void setOrphanList(List<VectorData> pOrphanList) {
        mOrphanList = pOrphanList;
    }

    public VectorDefinition getVectorDefinition() {
        return mVectorDefinition;
    }

    public void setVectorDefinition(VectorDefinition pVectorDefinition) {
        this.mVectorDefinition = pVectorDefinition;
    }

    public List<VectorData> getVectorList() {
        return mVectorList;
    }

    public void setVectorList(List<VectorData> vectorSpace) {
        this.mVectorList = vectorSpace;

//		// Setting the vector translation list
//		int vectorSize = vectorSpace.get(0).getByteCoordinates().length;
//
//		// Reset the TranslationVectorList
//		setCoordinatesTranslationVectorList(new ArrayList<byte[]>());
//
//		for (int i=0; i<vectorSpace.size(); i++) {
//			addEmptyTranslatorVectorArray(vectorSize);
//		}
    }

    public VectorManager getVectorManager() {
        return vectorManager;
    }

    public void setVectorManager(VectorManager vectorManager) {
        this.vectorManager = vectorManager;
    }

    public void markAllVectorsInList() {
        for (int i = 0; i < getVectorList().size(); i++) {
            get(i).setMark();
        }
    }

    public List<TreeResult> obtainSimilarChildren(VectorData pSearchVectorData,
                                                  int pMaxResults,
                                                  double pMinSimilarityAllowed) {
        return getVectorManager().obtainSimilarChildren(
                pSearchVectorData,
                getVectorList(),
                pMaxResults,
                0,
                this.getVectorList().size(),
                pMinSimilarityAllowed,
                getComparator());
    }

    public double obtainSimilarity(VectorData pVector1, VectorData pVector2) throws Exception {

        return getComparator().computeSimilarity(
                pVector1.getByteCoordinates(),
                pVector2.getByteCoordinates());
    }

    public double obtainSimilarityUsingTrainingComparator(VectorData pVector1, VectorData pVector2) throws Exception {

        return getOriginalComparatorWhenTraining().computeSimilarity(
                pVector1.getByteCoordinates(),
                pVector2.getByteCoordinates());
    }

    public List<TreeResult> obtainSimilarResults(VectorData pSearchVectorData,
                                                 int pMaxResults,
                                                 double pMinSimilarityAllowed,
                                                 boolean pIgnoreMarkedVectors) {

        return getVectorManager().obtainByteVectorSimilarities(
                pSearchVectorData,
                getVectorList(),
                pMaxResults,
                0,
                this.getVectorList().size(),
                pMinSimilarityAllowed,
                getComparator(),
                false);
    }

    /**
     * Obtains similar elements from the vectorSpace
     *
     * @param pSearchVectorData     The searched data
     * @param pMaxResults           Maximum number of results to retrieve
     * @param pStartPos             Starting position in the VS
     * @param pEndPos               Ending position in the VS
     * @param pMinSimilarityAllowed Threshold
     * @return
     */
    public List<TreeResult> obtainSimilarResults(VectorData pSearchVectorData,
                                                 int pMaxResults,
                                                 int pStartPos,
                                                 int pEndPos,
                                                 double pMinSimilarityAllowed,
                                                 boolean pIgnoreMarkedVectors) {

        return getVectorManager().obtainByteVectorSimilarities(
                pSearchVectorData,
                getVectorList(),
                pMaxResults,
                pStartPos,
                pEndPos,
                pMinSimilarityAllowed,
                getComparator(),
                pIgnoreMarkedVectors);
    }

    public void setComparatorDrillDown(VsComparisonCriteriaHandler compareCriteria) {
        // set the new comparator
        mComparator = compareCriteria;

        // drill down to set the comparator in all the children
        for (int i = 0; i < getVectorList().size(); i++) {
            if (get(i).getVectorSpace() != null) {
                get(i).getVectorSpace().setComparatorDrillDown(compareCriteria);
            }
        }
    }

    public int size() {
        return mVectorList.size();
    }

    public List<TreeResult> treeSearch_old(VectorData pSearchVectorData,
                                           int pMaxResults,
                                           double pMinSimilarityAllowed,
                                           boolean pShowLogs) throws Exception {

        return getVectorManager().treeSearchChildren(pSearchVectorData,
                this,
                pMaxResults,
                pMinSimilarityAllowed,
                pShowLogs);
    }


    public List<TreeResult> recursiveTreeSearch(VectorData pSearchVectorData,
                                                int pMaxResults,
                                                double pMinSimilarityAllowed,
                                                double pIgnoreRadious,
                                                boolean pReturnAlsoParents) throws Exception {
        return getVectorManager().recursiveTreeSearch(pSearchVectorData,
                this,
                pMaxResults,
                pMinSimilarityAllowed,
                pIgnoreRadious,
                pReturnAlsoParents);
    }


    public void unMarkAllVectorsInList() {
        for (int i = 0; i < getVectorList().size(); i++) {
            get(i).unsetMark();
        }
    }

    public VsComparisonCriteriaHandler getOriginalComparatorWhenTraining() {
        return mOriginalComparatorWhenTraining;
    }

    public void setOriginalComparatorWhenTraining(
            VsComparisonCriteriaHandler originalComparatorWhenTraining) {
        mOriginalComparatorWhenTraining = originalComparatorWhenTraining;
    }

//	public String getVectorSpaceFileName() {
//		return mVectorSpaceFileName;
//	}
//
//	public void setVectorSpaceFileName(String vectorSpaceFileName) {
//		mVectorSpaceFileName = vectorSpaceFileName;
//	}


}
