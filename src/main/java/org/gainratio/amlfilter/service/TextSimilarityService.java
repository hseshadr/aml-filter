package org.gainratio.amlfilter.service;

import lombok.Data;
import org.apache.commons.collections.map.LRUMap;
import org.gainratio.amlfilter.algorithms.SimilarityComparator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
import java.util.ArrayList;
import java.util.List;


/**
 * The name similarities service defines algorithms that detect
 * similarities between names utilizing a variety of different
 * methods (phonetical algorithms, string similarity algorithms).
 */
@Data
@Service
public class TextSimilarityService {
    private static final Logger logger = LoggerFactory.getLogger(TextSimilarityService.class);
    private int initialWordSimilarityCacheSize = 10000;
    private LRUMap wordSimilarityCache = new LRUMap(10000, true);
    private List<SimilarityComparator> stringSimilarityAlgorithms = new ArrayList<SimilarityComparator>();
    private List<SimilarityComparator> phoneticSimilarityAlgorithms = new ArrayList<SimilarityComparator>();


    /**
     * After setting the bean properties load all the synonyms
     * into the synonym map
     *
     * @throws Exception
     */
    @PostConstruct
    public void init() throws Exception {
        setWordSimilarityCache(new LRUMap(getInitialWordSimilarityCacheSize(), true));
    }

    public float getStringSimilarity(String pName1, String pName2) {
        final String methodSignature = "float getStringSimilarity(String,String): ";
        return getSimilarity(pName1, pName2, getStringSimilarityAlgorithms(), methodSignature);
    }

    public float getPhoneticSimilarity(String pName1, String pName2) {
        final String methodSignature = "float getPhoneticSimilarity(String,String): ";
        return getSimilarity(pName1, pName2, getPhoneticSimilarityAlgorithms(), methodSignature);
    }

    protected float getSimilarity(String pName1,
                                  String pName2,
                                  List<SimilarityComparator> pSimilarityAlgorithms,
                                  String pMethodSignature) {
        int numAlgorithms = pSimilarityAlgorithms.size();
        float similarity = 0f;
        float maxSimilarity = 0f;

        logger.debug(pMethodSignature + "Comparing : " + pName1 + " to " + pName2);


        if (0 == numAlgorithms) {
            logger.debug(pMethodSignature + " Number of algorithms configured is zero! returning 0 similarity");
            return 0f;
        }

        // Check first to see if the string are exactly the same
        // (this avoids bugs from certain algorithms that require a minimum length
        // to be processed. MTB 19-oct 2008)
        if (pName1.equals(pName2)) {
            similarity = 1f;
            logger.debug(pMethodSignature + " * EXACT MATCH : Similarity: " + similarity);

        } else {
            // Get the maximum similarity
            for (int i = 0; i < numAlgorithms; i++) {
                SimilarityComparator tsc = pSimilarityAlgorithms.get(i);
                similarity = tsc.getSimilarity(pName1, pName2);
                if (similarity > maxSimilarity) {
                    maxSimilarity = similarity;
                }

                logger.debug(pMethodSignature + tsc.getClass().getName() + ": " + " similarity: " + similarity);

            }
            similarity = maxSimilarity;
        }
        logger.debug(pMethodSignature + "Similarity: " + similarity);

        return similarity;
    }

    /**
     * Get the word similarity between the two words
     *
     * @param pWord1 The first word
     * @param pWord2 The second word
     * @return The word similarity or null meaning the mapping of the two words does not
     * exist in this mapping, the word similarity computations have to be done dynamically
     */
    public WordSimilarity getWordSimilarity(String pWord1, String pWord2) {
        WordSimilarity wordSimilarity = null;
        String key = null;
        StringBuilder keyBuffer = new StringBuilder();
        keyBuffer.append(pWord1);
        keyBuffer.append("_");
        keyBuffer.append(pWord2);
        key = keyBuffer.toString();
        synchronized (wordSimilarityCache) {
            wordSimilarity = (WordSimilarity) wordSimilarityCache.get(key);
        }
        if (null != wordSimilarity) {
            return wordSimilarity;
        }

        keyBuffer = new StringBuilder();
        keyBuffer.append(pWord2);
        keyBuffer.append("_");
        keyBuffer.append(pWord1);
        key = keyBuffer.toString();
        synchronized (wordSimilarityCache) {
            wordSimilarity = (WordSimilarity) wordSimilarityCache.get(key);
        }

        return wordSimilarity;
    }

    /**
     * Stores/Updates an entry within a map by concatenating
     * both passed in words as the key and the value being
     * the word similarity obj.
     *
     * @param pWord1          The first word
     * @param pWord2          The second word
     * @param pWordSimilarity The word similarity
     */
    public void setWordSimilarity(String pWord1,
                                  String pWord2,
                                  WordSimilarity pWordSimilarity) {
        StringBuilder keyBuffer = new StringBuilder();
        keyBuffer.append(pWord1);
        keyBuffer.append("_");
        keyBuffer.append(pWord2);
        synchronized (wordSimilarityCache) {
            wordSimilarityCache.put(keyBuffer.toString(), pWordSimilarity);
        }
    }
}