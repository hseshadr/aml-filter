package org.gainratio.amlfilter.search.comparisonCriteria;

import java.io.Serializable;
import java.io.UnsupportedEncodingException;


public class VsCriteria_CompAlgs extends VsComparisonCriteriaHandler implements Serializable {

    private static final long serialVersionUID = -7533967667900845057L;

    // The instance
    private static VsCriteria_CompAlgs mVsCriteria_CompAlgs;

//	public VsCriteria_CompAlgs getInstance() {
//
//		if (null == mTextSimilarityMappingPathService)
//		{
//			mTextSimilarityMappingPathService = new TextSimilarityMappingPathService();
//			initializeMappingPathService(mTextSimilarityMappingPathService);
//			algorithmsService = mTextSimilarityMappingPathService.getAlgorithmsService();
//		}
//
//		return mVsCriteria_CompAlgs;
//	}


    public VsCriteria_CompAlgs() {
        criteriaName = "COMP ALGORITHMS";
        minSimilarityValue = 0;
        maxSimilarityValue = 1;
        setNumDimensionsFix(false);

//		if (null == mTextSimilarityMappingPathService)
//		{
//			mTextSimilarityMappingPathService = new TextSimilarityMappingPathService();
//			initializeMappingPathService(mTextSimilarityMappingPathService);
//			algorithmsService = mTextSimilarityMappingPathService.getAlgorithmsService();
//		}
    }


    public double computeSimilarity(int[] vectorData1, int[] vectorData2) {

        double retVal = minSimilarityValue;

        return retVal;
    }

    public double computeSimilarity(byte[] vectorData1, byte[] vectorData2) throws UnsupportedEncodingException {

        double retVal = 0;

//		retVal = mTextSimilarityMappingPathTrainingService.getTextSimilarity(
//														new String(vectorData1, "UTF-8"),
//														new String(vectorData2, "UTF-8")
//														);

        return retVal;
    }

    public int compare2doubles(double pValue1, double pValue2) {
        return Double.compare(pValue2, pValue1);
    }

}
