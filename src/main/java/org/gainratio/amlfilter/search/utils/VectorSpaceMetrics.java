

package org.gainratio.amlfilter.search.utils;

import org.gainratio.amlfilter.search.vectorSpace.VectorSpace;

public class VectorSpaceMetrics {

    private float mAverageSimilarity = 0;
    private VectorSpace mVs = null;
    private double mMaxSimilarityDifference = -1f;
    private int mNumDimensions = -1;
    private String mComparator_Name = null;
    private long mMaxDistance = 0l;

    public VectorSpaceMetrics(VectorSpace pVs) throws Exception {
        setVs(pVs);

        float avgSim = (float) VectorUtils.computeAverageSimilarity(pVs);

        setAverageSimilarity(avgSim);

        setComparator_Name(pVs.getComparator().getCriteriaName());

        // number of dimensions
        if (getVs().getComparator().isNumDimensionsFix()) {
            if (getVs().getVectorList() != null && !getVs().getVectorList().isEmpty()) {
                setNumDimensions(getVs().getVectorList().get(0).getByteCoordinates().length);
            } else {
                setNumDimensions(0);
            }
        }

        // max distance
        if (getVs().getComparator().isNumDimensionsFix()) {

            if (getNumDimensions() > 0) {
                double maxLinearDistance = getVs().getComparator().getMaxSimilarityValue()
                        -
                        getVs().getComparator().getMinSimilarityValue();

                double sqrMaxLinDist = maxLinearDistance * maxLinearDistance;
                double maxDistance = Math.sqrt(getNumDimensions() * sqrMaxLinDist);
                setMaxSimilarityDifference(maxDistance);
            } else {
                setMaxSimilarityDifference(0);
            }
        } else {
            setMaxSimilarityDifference(
                    Math.abs(
                            getVs().getComparator().getMaxSimilarityValue()
                                    -
                                    getVs().getComparator().getMinSimilarityValue())
            );
        }

        String compName = getVs().getComparator().getCriteriaName();

        // Number of dimensions
        if (getNumDimensions() > 0) {
            long dimSqr = 127 * 127;
            long maxDistance = Math.round(Math.sqrt(getNumDimensions() * dimSqr));
            setMaxDistance(maxDistance);
        } else {
            setMaxDistance(-1l);
        }

    }

    public int getNumDimensions() {
        return mNumDimensions;
    }

    public void setNumDimensions(int numDimensions) {
        this.mNumDimensions = numDimensions;
    }

    public String getComparator_Name() {
        return mComparator_Name;
    }

    public void setComparator_Name(String comparator_Name) {
        this.mComparator_Name = comparator_Name;
    }

    public double getMaxPossibleSimilarityDifference() {
        return mMaxSimilarityDifference;
    }

    public void setMaxSimilarityDifference(double maxSimilarityDifference) {
        this.mMaxSimilarityDifference = maxSimilarityDifference;
    }

    public long getMaxDistance() {
        return mMaxDistance;
    }

    public void setMaxDistance(long pMaxDistance) {
        this.mMaxDistance = pMaxDistance;
    }

    public float getAverageSimilarity() {
        return mAverageSimilarity;
    }

    public void setAverageSimilarity(float averageSimilarity) {
        this.mAverageSimilarity = averageSimilarity;
    }

    public VectorSpace getVs() {
        return mVs;
    }

    public void setVs(VectorSpace vs) {
        this.mVs = vs;
    }

    public String toString() {
        StringBuffer retVal = new StringBuffer();
        retVal.append("#Metrics:\n");
        retVal.append("\t- NumDimensions:\t");
        retVal.append(getNumDimensions());
        retVal.append(" (If -1, not fixed. If 0, undertermined yet.)\n");
        retVal.append("\t- AverageSimilarity:\t");
        retVal.append(getAverageSimilarity());
        retVal.append("\n");
        retVal.append("\t- MaxPossibleSimilarityDifference:\t");
        retVal.append(getMaxPossibleSimilarityDifference());
        retVal.append("\n");
        retVal.append("\t- Comparator_Name:\t");
        retVal.append(getComparator_Name());
        retVal.append("\n");

        return retVal.toString();
    }

}
