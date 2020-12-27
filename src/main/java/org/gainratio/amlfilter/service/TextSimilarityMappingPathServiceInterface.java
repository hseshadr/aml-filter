

package org.gainratio.amlfilter.service;


/**
 * @author Marco Baena
 */
public interface TextSimilarityMappingPathServiceInterface {
    /**
     * Get the text similarity mapping path for two text strings passed in
     *
     * @param pSearchName    The search name
     * @param pBlackListName The blsck list name
     * @return The text similarity mapping path
     */
    TextSimilarityMappingPath getTextSimilarityMappingPath(String pSearchName, String pBlackListName);

    /**
     * Get the text similarity (%) for two text strings passed in
     *
     * @param pSearchName    The search name
     * @param pBlackListName The blsck list name
     * @return The text similarity in a float
     */
    float getTextSimilarity(String pSearchName, String pBlackListName);

}