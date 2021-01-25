package org.gainratio.amlfilter.service;

import lombok.Data;
import org.gainratio.amlfilter.model.Result;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * Analyzes the search results, using decision trees to accept/reject possbile matches
 */
@Data
@Service
public class SearchResultAnalyzerService {
    private static final Logger logger = LoggerFactory.getLogger(SearchResultAnalyzerService.class);
    @Autowired
    private TextSimilarityMappingPathService textSimilarityMappingPathService;
    private float wholeNameHighTextSimilarityThreshold = 0.76f;

    public ResultMatch resultMatch(String pName1, String pName2, Result pResult) {
        float textSimilarity = getTextSimilarityMappingPathService().getTextSimilarity(pName1, pName2);
//        logger.info("Text Similarity: " + textSimilarity);
        pResult.setTextSimilarity((double) textSimilarity);
        // CASE 1: Very similar
        // ********************
        // If the text similarity is very high, it look like we found the match
//        logger.info("*PASS* CASE 1: High relative similarity: " + pName1 + "/" + pName2 + "  SIM: " + textSimilarity + " %");
        boolean match = textSimilarity >= wholeNameHighTextSimilarityThreshold;
        return new ResultMatch(pResult, (double) textSimilarity, match);
    }
}
