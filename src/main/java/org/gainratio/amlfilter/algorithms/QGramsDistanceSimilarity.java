package org.gainratio.amlfilter.algorithms;


/**
 * Text similarity comparator which defines an abstract
 * method called getSimilarity which must be implemented.
 *
 * @author Harish Seshadri
 * @version $Id: QGramsDistanceSimilarity.java,v 1.2 2007/12/15 23:29:59 sss Exp $
 */

public class QGramsDistanceSimilarity extends SimilarityComparator {
    /**
     * Get the similarity
     *
     * @param pName1 The first name
     * @param pName2 The second name
     * @return The simlarity
     */
    public final float getSimilarity(String pName1, String pName2) {
        //QGramsDistance qGramsDistance = new QGramsDistance();
        //float similarity = qGramsDistance.getSimilarity(pName1, pName2);
        //return similarity;

        // The following lines forces the incoming string to have enough length
        if (pName1.length() < 3) {
            String baseName = pName1;

            pName1 += baseName;

            if (pName1.length() < 3) {
                pName1 += baseName;
            }

        }

        if (pName2.length() < 3) {
            String baseName = pName2;

            pName2 += baseName;

            if (pName2.length() < 3) {
                pName2 += baseName;
            }

        }

//		logger.debug(" * (In qGramsDistanceSimilarity) name1=" + pName1 + " name2=" + pName2);

        return getTripleSimilarities(pName1, pName2);
    }

    public final float getTripleSimilarities(final String pText1, final String pText2) {
        double intersection = 0;
        double union;

        String cleanedText1 = pText1;
        String cleanedText2 = pText2;

        char[] triplesArray1 = getTriples(cleanedText1);
        int triplesArray1Size = triplesArray1.length;
        char[] triplesArray2 = getTriples(cleanedText2);
        int triplesArray2Size = triplesArray2.length;

        union = (triplesArray1Size + triplesArray2Size) / 3;

        if (union == 0) {
            union = 1;
        }

        for (int i = 0; i < triplesArray1.length - 2; i += 3) {
            // Get the first char for array 1
            char firstCharForArray1 = triplesArray1[i];
            // Get the next char for array 1
            char secondCharForArray1 = triplesArray1[i + 1];
            // Get the next char for array 1
            char thirdCharForArray1 = triplesArray1[i + 2];


            for (int j = 0; j < triplesArray2.length - 2; j += 3) {
                // Get the first char for array 2
                char firstCharForArray2 = triplesArray2[j];
                // Get the next char for array 2
                char secondCharForArray2 = triplesArray2[j + 1];
                // Get the next char for array 2
                char thirdCharForArray2 = triplesArray2[j + 2];


                if (firstCharForArray1 == firstCharForArray2 &&
                        secondCharForArray1 == secondCharForArray2 &&
                        thirdCharForArray1 == thirdCharForArray2 &&
                        firstCharForArray2 != 0xFF &&
                        secondCharForArray2 != 0xFF &&
                        thirdCharForArray2 != 0xFF) {
                    intersection++;
                    // Eliminate the triple that was found
                    triplesArray2[j] = 0xFF;
                    triplesArray2[j + 1] = 0xFF;
                    triplesArray2[j + 2] = 0xFF;

//                    logger.debug("Found\n");

                    // I have found the triple so break out
                    break;
                }
            }
        }

        float similarity = (float) ((intersection * 2) / union);

        return similarity;
    }

    protected char[] getTriples(final String pText) {
        char[] charArray = pText.toCharArray();
        int textLength = charArray.length - 2;
        StringBuilder tripleBuffer = new StringBuilder();
        for (int i = 0; i < textLength; i++) {
            char firstCharacter = charArray[i];
            char secondCharacter = charArray[i + 1];
            char thirdCharacter = charArray[i + 1];

            if ((!(' ' == firstCharacter)) && !(' ' == secondCharacter) && !(' ' == thirdCharacter)) {
                tripleBuffer.append(firstCharacter).
                        append(secondCharacter).
                        append(thirdCharacter);
            }
        }

        return tripleBuffer.toString().toCharArray();
    }
}