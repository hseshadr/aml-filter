

package org.gainratio.amlfilter.algorithms;


import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Text similarity comparator which defines an abstract
 * method called getSimilarity which must be implemented.
 *
 * @author Marco Baena
 * @version $Id: PairSimilarity.java,v 1.2 2007/12/15 23:29:59 sss Exp $
 */

public class PairSimilarityCount extends SimilarityComparator {
    private static final Logger logger = LoggerFactory.getLogger(PairSimilarityCount.class);

    /**
     * Get the similarity
     *
     * @param pName1 The first name
     * @param pName2 The second name
     * @return The simlarity
     */
    public final float getSimilarity(String pName1, String pName2) {
        return getPairSimilarities(pName1, pName2);
    }

    public final float getPairSimilarities(final String pText1, final String pText2) {
        double intersection = 0;
        double union;

        String cleanedText1 = pText1;
        String cleanedText2 = pText2;

        char[] pairsArray1 = getPairs(cleanedText1);
        int pairsArray1Size = pairsArray1.length;
        char[] pairsArray2 = getPairs(cleanedText2);
        int pairsArray2Size = pairsArray2.length;

        union = (pairsArray1Size + pairsArray2Size) / 2;

        if (union == 0) {
            union = 1;
        }

        if (logger.isDebugEnabled()) {
            logger.debug("Pair Array 1: " + new String(pairsArray1));
            logger.debug("Pair Array 2: " + new String(pairsArray2));
        }

        for (int i = 0; i < pairsArray1.length - 1; i += 2) {
            // Get the first char for array 1
            char firstCharForArray1 = pairsArray1[i];
            // Get the next char for array 1
            char nextCharForArray1 = pairsArray1[i + 1];

            if (logger.isDebugEnabled()) {
                logger.debug("firstCharForArray1 = " + firstCharForArray1 +
                        "; nextCharForArray1 = " + nextCharForArray1);
            }

            for (int j = 0; j < pairsArray2.length - 1; j += 2) {
                // Get the first char for array 2
                char firstCharForArray2 = pairsArray2[j];
                // Get the next char for array 2
                char nextCharForArray2 = pairsArray2[j + 1];

                if (logger.isDebugEnabled()) {
                    logger.debug("\tfirstCharForArray2 = " + firstCharForArray2 +
                            "; nextCharForArray2 = " + nextCharForArray2);
                }

                if (firstCharForArray1 == firstCharForArray2 &&
                        nextCharForArray1 == nextCharForArray2 &&
                        firstCharForArray2 != 0xFF &&
                        nextCharForArray2 != 0xFF) {
                    intersection++;
                    // Eliminate the pair that was found
                    pairsArray2[j] = 0xFF;
                    pairsArray2[j + 1] = 0xFF;

                    if (logger.isDebugEnabled()) {
                        logger.debug("Found\n");
                    }
                    // I have found the pair so break out
                    break;
                }
            }
        }

        float similarity = (float) intersection;

        if (logger.isDebugEnabled()) {
            logger.debug("Union: " + union);
            logger.debug("Intersection: " + intersection);
            logger.debug("Similarity: " + similarity);
        }

        return similarity;
    }

    protected char[] getPairs(final String pText) {
        char[] charArray = pText.toCharArray();
        int textLength = charArray.length - 1;
        StringBuilder pairBuffer = new StringBuilder();
        for (int i = 0; i < textLength; i++) {
            char firstCharacter = charArray[i];
            char nextCharacter = charArray[i + 1];

            if ((!(' ' == firstCharacter)) && !(' ' == nextCharacter)) {
                pairBuffer.append(firstCharacter).append(nextCharacter);
            }
        }

        return pairBuffer.toString().toCharArray();
    }
}