
package org.gainratio.amlfilter.service;

import lombok.Data;
import org.gainratio.amlfilter.algorithms.PairSimilarity;
import org.gainratio.amlfilter.util.GeneralConstants;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.config.PropertyPlaceholderConfigurer;
import org.springframework.beans.factory.xml.XmlBeanFactory;
import org.springframework.core.io.FileSystemResource;
import org.springframework.stereotype.Service;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

@Data
@Service
public class TextSimilarityMappingPathService  {
    private Logger logger = LoggerFactory.getLogger(getClass());
    public static final float PHONETIC_PERCENT_WEIGHT = 0.8f;
    private WordServiceInterface wordService;
    private TextSimilarityService textSimilarityService;

    private static String simTableInfoToString(
            String[] name1TokensArray,
            String[] name2TokensArray,
            float[][] similarityArray,
            String pTag) {

        StringBuffer line = new StringBuffer();

        if (null == pTag) {
            pTag = "";
        }

        line.append("\n *************************** ");
        line.append("\n *** " + pTag);
        line.append("\n * Similarity Array:");

        for (int b = 0; b < name2TokensArray.length; b++) {
            for (int a = 0; a < name1TokensArray.length; a++) {
                line.append("\n[" + a + "," + b + "] ... " + similarityArray[a][b] + "\t'" + name1TokensArray[a] + "' / '" + name2TokensArray[b] + "'");
            }
        }

        line.append("\n *************************** ");

        return line.toString();
    }

    private static String mpInfoToString(
            String pSearchName,
            String pBlackListName,
            TextSimilarityMappingPath[] mappingPaths,
            int mostRelevantPath,
            float totalWlWeight,
            String[] name1TokensArray,
            String[] name2TokensArray) {
        StringBuffer line = new StringBuffer();

        line.append(GeneralConstants.NEW_LINE_TOKEN);
        line.append("\n*** Comparing: \t\t" + pSearchName + " / " + pBlackListName);
        line.append(GeneralConstants.NEW_LINE_TOKEN);
        line.append("* totalSimilarityWeight = " + mappingPaths[mostRelevantPath].totalSimilarityWeight);
        line.append(GeneralConstants.NEW_LINE_TOKEN);
        line.append("* relativeWeightedSimilarity = " + mappingPaths[mostRelevantPath].relativeWeightedSimilarity);
        line.append(GeneralConstants.NEW_LINE_TOKEN);
        line.append("* totalBLWeight = " + mappingPaths[mostRelevantPath].totalBLWeight);
        line.append(GeneralConstants.NEW_LINE_TOKEN);
        line.append("* totalWlWeight = " + totalWlWeight);
        line.append(GeneralConstants.NEW_LINE_TOKEN);
        line.append("MP Object: " + mappingPaths[mostRelevantPath].toString());
        line.append(GeneralConstants.NEW_LINE_TOKEN);
        line.append("*");
        line.append(GeneralConstants.NEW_LINE_TOKEN);

        int a = 0;
        int b = 0;
        for (int j = 0; j < mappingPaths[mostRelevantPath].size; j++) {
            a = mappingPaths[mostRelevantPath].A[j];
            b = mappingPaths[mostRelevantPath].B[j];

            line.append("* node(j)=" + j +
                    " [a,b]=" +
                    a + "," + b +
                    "]  SIM = " +
                    mappingPaths[mostRelevantPath].similarity[j]);

            line.append("\t " + name1TokensArray[a] + " / " + name2TokensArray[b]);
            line.append(GeneralConstants.NEW_LINE_TOKEN);
        }

        line.append("****** (exiting getTextSimilarityMappingPath) ******");

        return line.toString();
    }

    public static void main(String[] args) {
        // Spring loader for the beans
        XmlBeanFactory beanFactory = new XmlBeanFactory(new FileSystemResource("test/applicationContext_test.xml"));
        PropertyPlaceholderConfigurer cfg = new PropertyPlaceholderConfigurer();
        cfg.setLocation(new FileSystemResource("test/admin-config_test.properties"));
        cfg.postProcessBeanFactory(beanFactory);
        TextSimilarityMappingPathService tsmps
                = (TextSimilarityMappingPathService) beanFactory.getBean("textSimilarityMappingPathService");

        //TextSimilarityMappingPathService tsmps = new TextSimilarityMappingPathService();
        String name1 = ".,Sevillano Orbe   Zigor	";
        String name2 = "^%$^%Orbe          Zigor <>?Sevillano  ";
        name1 = AlgorithmsService.cleanString(name1);
        name2 = AlgorithmsService.cleanString(name2);
        boolean identical = tsmps.areNamesIdentical(name1, name2);
        System.out.println("name1: " + name1 + "; name2: " + name2 + "; areIdentical: " + identical);


        // Testing the shrinking
        String name3 = "Sevillano";
        String name4 = "Sevilla no";
        float similarity = tsmps.getTextSimilarity(name3, name4);

        System.out.println("name3: " + name3 + "; name4: " + name4 + "; similarity = " + similarity);

        name3 = "AAB Se villano";
        name4 = "Sevillano AA B";
        similarity = tsmps.getTextSimilarity(name3, name4);

        System.out.println("name3: " + name3 + "; name4: " + name4 + "; similarity = " + similarity);

        name3 = "A AAB Sevilla no Lo pez";
        name4 = "Lopez AAAB Sevil lano ";
        similarity = tsmps.getTextSimilarity(name3, name4);

        System.out.println("name3: " + name3 + "; name4: " + name4 + "; similarity = " + similarity);

        name3 = "Macumba Ma tumba Lopez 1";
        name4 = "Macumba Lopez Ma tumba 2";

        similarity = tsmps.getTextSimilarity(name3, name4);

        System.out.println("name3: " + name3 + "; name4: " + name4 + "; similarity = " + similarity);

        // Testing initials
        name3 = "Alberto PEPE";
        name4 = "PEPE A";
        similarity = tsmps.getTextSimilarity(name3, name4);

        System.out.println("name3: " + name3 + "; name4: " + name4 + "; similarity = " + similarity);

        name3 = "Alberto Lopez PEPE";
        name4 = "PEPE A Lopez Albret";
        similarity = tsmps.getTextSimilarity(name3, name4);

        System.out.println("name3: " + name3 + "; name4: " + name4 + "; similarity = " + similarity);

        name3 = "Alberto Lopez PEPE";
        name4 = "PEPE B Lopez Albret";
        similarity = tsmps.getTextSimilarity(name3, name4);

        System.out.println("name3: " + name3 + "; name4: " + name4 + "; similarity = " + similarity);

        name3 = "AbasMohamad Nasir";
        name4 = "Abas Mohamad Nasir";
        similarity = tsmps.getTextSimilarity(name3, name4);

        System.out.println("name3: " + name3 + "; name4: " + name4 + "; similarity = " + similarity);


        name3 = "PEPE Lopez mi guel ";
        name4 = "miguel PEPE L  ";
        long startTime = System.currentTimeMillis();
        int numIterations = 100000;
        System.out.println("checking performance...");
        for (int i = 0; i < numIterations; i++) {
            similarity = tsmps.getTextSimilarity(name3, name4);
        }
        System.out.println("Time : " + ((float) (System.currentTimeMillis() - startTime) / (float) numIterations));

    }

    /**
     * Adjust the array of maximum values
     */
    private void adjustMaximumValues(
            float similarity,
            int i,
            int j,
            float[] maxSimilarityValFor1,
            float[] maxSimilarityValFor2) {

        if (maxSimilarityValFor1[i] < similarity) {
            maxSimilarityValFor1[i] = similarity;
        }

        if (maxSimilarityValFor2[j] < similarity) {
            maxSimilarityValFor2[j] = similarity;
        }
    }

    /**
     * Get the text similarity mapping path for two text strings passed in
     * This method uses a different implementation than the original one: the algorithm for getting the
     * mapping path is not recursive and does not have the original depth limitation.
     */
    protected TextSimilarityMappingPath getTextSimilarityMappingPath(String pSearchName, String pBlackListName) {
        final String methodSignature = "getTextSimilarityMappingPath(String,String): ";

        String name1 = pSearchName;
        String name2 = pBlackListName;

        logger.debug(methodSignature +
                "Search name = " + pSearchName +
                "; Black list name = " + pBlackListName);


        // Tokenize the names we receive
        String[] name1TokensArray = name1.split(" ");
        String[] name2TokensArray = name2.split(" ");


        // Create similarity array
        float[][] similarityArray = new float[name1TokensArray.length][name2TokensArray.length];
        float[] maxSimilarityValFor1 = new float[name1TokensArray.length];
        float[] maxSimilarityValFor2 = new float[name2TokensArray.length];

        // Create the mapping path array
        // TODO: make this a hashset
        TextSimilarityMappingPath[] mappingPaths = new TextSimilarityMappingPath[10];


        // Establish the weights for the black list name
        float[] blackListWeights = new float[name2TokensArray.length];


        // **************************
        // Build the similarity table
        // **************************
        String name1Token = null;
        String name2Token = null;
        float similarity = 0;
        float totalBlWeight = 0;
        for (int j = 0; j < name2TokensArray.length; j++) {
            name2TokensArray[j] = name2TokensArray[j].trim();
            name2Token = name2TokensArray[j];

            // **************************
            // Compute the BL similarity
            // **************************
            blackListWeights[j] = getWordService().getWordLength(name2Token);
            totalBlWeight += blackListWeights[j];

            for (int i = 0; i < name1TokensArray.length; i++) {
                name1TokensArray[i] = name1TokensArray[i].trim();
                name1Token = name1TokensArray[i];

                similarity = getSimilarity(name1Token, name2Token);

                // Filling the cell the cell
                similarityArray[i][j] = similarity;

                // Adjust maximums
                adjustMaximumValues(similarity, i, j, maxSimilarityValFor1, maxSimilarityValFor2);

            }
        }

        // Debug: shows the similarity table
        String line = simTableInfoToString(name1TokensArray, name2TokensArray, similarityArray, "Before SHRINKING TOKENS");
        logger.debug(line);


        // ********************
        // Shrinking the tokens
        // ********************
        // Looks for possible combinations of the words and chooses the most relevant one.

        String[] name1TokensArrayBis = name1TokensArray.clone();
        String[] name2TokensArrayBis = name2TokensArray.clone();
        float combinedSimilarity = 0;
        String name1Token1 = null;
        String name1Token2 = null;
        // first pass: looking for words separated in the WL name
        for (int b = 0; b < name2TokensArray.length; b++) {
            name2Token = name2TokensArray[b];

            for (int a = 0; a < name1TokensArray.length - 1; a++) {
                // If there is something relevant to check and the original token is not a exact match
                if (
                        similarityArray[a][b] > 0.1f
                                &&
                                similarityArray[a + 1][b] > 0.1f
                                &&
                                similarityArray[a][b] != 1f
                                &&
                                similarityArray[a + 1][b] != 1f
                ) {
                    name1Token1 = name1TokensArrayBis[a];
                    name1Token2 = name1TokensArrayBis[a + 1];
                    StringBuilder combinedTokensBuffer = new StringBuilder(name1Token1);
                    combinedTokensBuffer.append(name1Token2);
                    combinedSimilarity = getSimilarity(combinedTokensBuffer.toString(), name2Token, false);

                    // check if the combined similarity is greater than the previous one
                    if (combinedSimilarity > similarityArray[a][b] &&
                            combinedSimilarity > similarityArray[a + 1][b] &&
                            combinedSimilarity > maxSimilarityValFor2[b] &&
                            combinedSimilarity > maxSimilarityValFor1[a] &&
                            combinedSimilarity > maxSimilarityValFor1[a + 1]) {
                        name1TokensArrayBis[a] = "";
                        name1TokensArrayBis[a + 1] = combinedTokensBuffer.toString();
                        similarityArray[a][b] = 0;    // done afterwards when erasing the whole column
                        similarityArray[a + 1][b] = combinedSimilarity;

                        // Adjust maximums
                        adjustMaximumValues(combinedSimilarity, a + 1, b, maxSimilarityValFor1, maxSimilarityValFor2);

                        // Delete the column
                        for (int i = 0; i < name2TokensArray.length; i++) {
                            similarityArray[a][i] = 0;
                        }
                        // Recompute the entire column that receives the new token
                        float tempSim = 0f;
                        for (int i = 0; i < name2TokensArray.length; i++) {
                            tempSim = getSimilarity(name1TokensArrayBis[a + 1], name2TokensArrayBis[i], false);
                            similarityArray[a + 1][i] = tempSim;
                            adjustMaximumValues(tempSim, a + 1, i, maxSimilarityValFor1, maxSimilarityValFor2);
                        }


                        // Debug: shows the similarity table
                        logger.debug("[" + a + "][" + b + "].Shrinking (WLname): " + name1Token1 + " + " + name1Token2 + " = " + name1TokensArrayBis[a + 1] + " ... reason: " + name2Token + " SIM: " + combinedSimilarity);
                        line = simTableInfoToString(name1TokensArray, name2TokensArray, similarityArray, "SHRUNK TOKEN in the first name");
                        logger.debug(line);

                    }
                }
            }
        }
        name1TokensArray = name1TokensArrayBis;

        name1Token = null;
        String name2Token1 = null;
        String name2Token2 = null;
        // second pass: looking for words separated in the BL name
        for (int a = 0; a < name1TokensArray.length; a++) {
            name1Token = name1TokensArray[a];

            for (int b = 0; b < name2TokensArray.length - 1; b++) {
                // If there is something relevant to check and the original token is not a exact match
                if (
                        similarityArray[a][b] > 0.1f
                                &&
                                similarityArray[a][b + 1] > 0.1f
                                &&
                                similarityArray[a][b] != 1f
                                &&
                                similarityArray[a][b + 1] != 1f
                ) {
                    name2Token1 = name2TokensArrayBis[b];
                    name2Token2 = name2TokensArrayBis[b + 1];
                    StringBuilder combinedTokensBuffer = new StringBuilder(name2Token1);
                    combinedTokensBuffer.append(name2Token2);
                    combinedSimilarity = getSimilarity(name1Token, combinedTokensBuffer.toString(), false);

                    // check if the combined similarity is greater than the previous one
                    if (combinedSimilarity > similarityArray[a][b] &&
                            combinedSimilarity > similarityArray[a][b + 1] &&
                            combinedSimilarity > maxSimilarityValFor1[a] &&
                            combinedSimilarity > maxSimilarityValFor2[b] &&
                            combinedSimilarity > maxSimilarityValFor2[b + 1]) {
                        name2TokensArrayBis[b] = "";
                        name2TokensArrayBis[b + 1] = combinedTokensBuffer.toString();
                        similarityArray[a][b + 1] = combinedSimilarity;
                        adjustMaximumValues(combinedSimilarity, a, b + 1, maxSimilarityValFor1, maxSimilarityValFor2);

                        // Delete the row that disappears
                        for (int i = 0; i < name1TokensArray.length; i++) {
                            similarityArray[i][b] = 0f;
                        }
                        // Recompute the entire row that receives the new token
                        float tempSim = 0f;
                        for (int i = 0; i < name1TokensArray.length; i++) {
                            tempSim = getSimilarity(name1TokensArrayBis[i], name2TokensArrayBis[b + 1], false);
                            similarityArray[i][b + 1] = tempSim;
                            adjustMaximumValues(tempSim, i, b + 1, maxSimilarityValFor1, maxSimilarityValFor2);
                        }

                        // Debug: shows the similarity table
                        line = simTableInfoToString(name1TokensArray, name2TokensArray, similarityArray, "SHRUNK TOKEN in the second name");
                        logger.debug(line);

                    }
                }
            }
        }

        name2TokensArray = name2TokensArrayBis;


        // Debug: shows the similarity table
        line = simTableInfoToString(name1TokensArray, name2TokensArray, similarityArray, "Before DEALING WITH INITIALS");
        logger.debug(line);


        // ***********************
        // INITIALS
        // ***********************
        float similarityForInitialMatching = 0.75f;
        // Make a final pass, detecting the possible initials for words
        for (int j = 0; j < name2TokensArray.length; j++) {
            name2Token = name2TokensArray[j];

            // name2token has a string
            if (name2Token.length() > 0) {
                for (int i = 0; i < name1TokensArray.length; i++) {
                    name1Token = name1TokensArray[i];

                    if (
                            (name1Token.length() == 1 || name2Token.length() == 1) // one is an initial
                                    &&
                                    (name1Token.length() > 0) // both have a string (the length of the name2token was already checked)
                                    &&
                                    similarityArray[i][j] < similarityForInitialMatching) // the similarity is below the suitable for the initials
                    {

                        // If the first char matches
                        if (name1Token.charAt(0) == name2Token.charAt(0)) {
                            // Assign similarity for initial matching to the words.
                            similarityArray[i][j] = similarityForInitialMatching;

                            // Adjust maximums
                            adjustMaximumValues(similarityForInitialMatching, i, j, maxSimilarityValFor1, maxSimilarityValFor2);
                        }

                    }
                }
            }
        }


        // Debug: shows the similarity table
        line = simTableInfoToString(name1TokensArray, name2TokensArray, similarityArray, "after DEALING WITH INITIALS");
        logger.debug(line);



        // ****************************************************************
        // Trim the similarity table so it does NOT contain very low values
        // ****************************************************************
        for (int b = 0; b < name2TokensArray.length; b++) {
            for (int a = 0; a < name1TokensArray.length; a++) {
                if (similarityArray[a][b] < 0.15) {
                    similarityArray[a][b] = 0;
                }
            }
        }


        // Create the initial mapping path
        TextSimilarityMappingPath actualMP = new TextSimilarityMappingPath();
        int mappingPathsCount = 1;
        mappingPaths[mappingPathsCount - 1] = actualMP;

        // ******************************************
        // Fill the mapping path
        // ******************************************

        // New method for retrieving the best match:
        // New version -- START --
        logger.debug("calling populateDirectly");
        mappingPaths = actualMP.populateDirectly(
                mappingPaths,
                mappingPathsCount,
                name1TokensArray.length,
                name2TokensArray.length,
                similarityArray,
                -1,
                blackListWeights
        );
        int mostRelevantPath = 0;        // for compatibility. Comment out with the whole block.
        float totalSimilarities = 0;    // for compatibility. Comment out with the whole block.
        // New version -- END --


        // After the tokens could have been shrinked (or recombined) they could have change.
        // It is necessary to recompute them.

        // ********* WL Weight *******************
        // Recompute the WL weights
        // ***************************************
        String name1Token_ = null;
        float totalWlWeight = 0;
        float[] wlWeight = new float[name1TokensArray.length];
        for (int i = 0; i < name1TokensArray.length; i++) {
            name1Token_ = name1TokensArray[i];
            wlWeight[i] = getWordService().getWordLength(name1Token_);
            totalWlWeight += wlWeight[i];
        }

        // ********* BL Weight *******************
        // Recompute the BL weights
        // ***************************************
        String name2Token_ = null;
        totalBlWeight = 0;
        blackListWeights = new float[name2TokensArray.length];
        for (int i = 0; i < name2TokensArray.length; i++) {
            name2Token_ = name2TokensArray[i];
            blackListWeights[i] = getWordService().getWordLength(name2Token_);
            totalBlWeight += blackListWeights[i];
        }


        totalSimilarities = 0; // reset to reuse the variable


        // Compute the total similarities with weights
        // *******************************************
        int blPathIndex = 0;
        int wlPathIndex = 0;
        for (int j = 0; j < mappingPaths[mostRelevantPath].size; j++) {
            wlPathIndex = mappingPaths[mostRelevantPath].A[j];
            blPathIndex = mappingPaths[mostRelevantPath].B[j];
            totalSimilarities += mappingPaths[mostRelevantPath].similarity[j]
                    * (
                    blackListWeights[blPathIndex]
                            +
                            wlWeight[wlPathIndex]
            ); // mappingPaths[mostRelevantPath].weight[j]
        }

        // Fill the total values of the mapping path
        // *****************************************
        mappingPaths[mostRelevantPath].totalSimilarityWeight = totalSimilarities;
        mappingPaths[mostRelevantPath].relativeWeightedSimilarity = (mappingPaths[mostRelevantPath].totalSimilarityWeight) / (totalBlWeight + totalWlWeight);
        mappingPaths[mostRelevantPath].totalBLWeight = totalBlWeight;

        line = mpInfoToString(
                pSearchName,
                pBlackListName,
                mappingPaths,
                mostRelevantPath,
                totalWlWeight,
                name1TokensArray,
                name2TokensArray);
        logger.debug(line);


        return mappingPaths[mostRelevantPath];
    }

    /**
     * Get the similarity between the words
     */
    private float getSimilarity(String pName1, String pName2) {
        return getSimilarity(pName1, pName2, true);
    }

    /**
     * Get the similarity between the words
     */
    private float getSimilarity(String pName1, String pName2, boolean pPutInCache) {
        final String methodSignature = "float getSimilarity(String,String): ";

        float phoneticSimilarity = 0;
        float stringSimilarity = 0;
        float similarity = 0;
        if (!pPutInCache) {
            stringSimilarity = getTextSimilarityService().getStringSimilarity(pName1, pName2);
            phoneticSimilarity = getTextSimilarityService().getPhoneticSimilarity(pName1, pName2);

        } else {
            WordSimilarity wordSimilarity = getTextSimilarityService().getWordSimilarity(pName1, pName2);
            if (null == wordSimilarity) {
                stringSimilarity = getTextSimilarityService().getStringSimilarity(pName1, pName2);
                phoneticSimilarity = getTextSimilarityService().getPhoneticSimilarity(pName1, pName2);
                wordSimilarity = new WordSimilarity();
                wordSimilarity.setPhoneticSimilarity(phoneticSimilarity);
                wordSimilarity.setStringSimilarity(stringSimilarity);
                getTextSimilarityService().setWordSimilarity(pName1, pName2, wordSimilarity);
                logger.debug("\n* COMPUTED similarity for strings (" + pName1 + "; " + pName2 + "): " + wordSimilarity);

            } else {
                stringSimilarity = wordSimilarity.getStringSimilarity();
                phoneticSimilarity = wordSimilarity.getPhoneticSimilarity();
                logger.debug("\n* CACHED similarity for strings (" + pName1 + "; " + pName2 + "): " + wordSimilarity);

            }
        }


        phoneticSimilarity = PHONETIC_PERCENT_WEIGHT * phoneticSimilarity;
        if (phoneticSimilarity >= stringSimilarity) {
            similarity = phoneticSimilarity;
        } else {
            similarity = stringSimilarity;
        }

        return similarity;
    }

    /**
     * Are the names identical?
     *
     * @param pSearchName1
     * @param pSearchName2
     * @return True if identical, false otherwise
     */
    protected boolean areNamesIdentical(String pSearchName1, String pSearchName2) {
        final String methodSignature = "boolean areNamesIdentical(String, String) : ";
        boolean retVal = true;
        try {
            if (pSearchName1.equals(pSearchName2)) {
                retVal = true;
                return retVal;
            }

            String[] name1TokensArray = pSearchName1.split(" ");
            String[] name2TokensArray = pSearchName2.split(" ");

            if (name1TokensArray.length != name2TokensArray.length) {
                retVal = false;
                return retVal;
            }
            Arrays.sort(name1TokensArray);
            Arrays.sort(name2TokensArray);
            for (int i = 0; i < name1TokensArray.length; i++) {
                if (false == name1TokensArray[i].equals(name2TokensArray[i])) {
                    retVal = false;
                    return retVal;
                }
            }


            return retVal;

        } finally {
            logger.debug(methodSignature + "identical = " + retVal);
        }
    }

    /**
     * Calculates if there is token count match
     *
     * @return True if the token count matched, false otherwise
     */
    protected boolean differsBy1TokenOrSameUniqueTokens(String pName1, String pName2) {
        String[] name1TokensArray = pName1.split(" ");
        String[] name2TokensArray = pName2.split(" ");

        Set<String> name1Set = new HashSet<String>();
        for (int i = 0; i < name1TokensArray.length; i++) {
            name1Set.add(name1TokensArray[i]);
        }
        Set<String> name2Set = new HashSet<String>();
        for (int i = 0; i < name2TokensArray.length; i++) {
            name2Set.add(name2TokensArray[i]);
        }
        int name1SetSize = name1Set.size();
        int name2SetSize = name2Set.size();
        if (Math.abs(name1SetSize - name2SetSize) > 1) {
            return false;
        }
        Set<String> nameASet = name1Set;
        Set<String> nameBSet = name2Set;
        if (name1SetSize > name2SetSize) {
            nameASet = name2Set;
            nameBSet = name1Set;
        }
        return nameASet.containsAll(nameBSet);
    }

    /**
     * Get the text similarity (%) for two text strings passed in
     *
     * @param pSearchName    The search name
     * @param pBlackListName The black list name
     * @return The text similarity in a float
     */
    public float getTextSimilarity(String pSearchName, String pBlackListName) {
        if (areNamesIdentical(pSearchName, pBlackListName)) {
            return 1.0f;
        }

    	/* Cover by token search
    	if (differsBy1TokenOrSameUniqueTokens(pSearchName, pBlackListName))
    	{
    		return getTokenService().getTokenMatchMagicSimilarity();
    	}
    	*/

        TextSimilarityMappingPath mp = getTextSimilarityMappingPath(pSearchName, pBlackListName);

        // MTB - this is a safe call to avoid possible mistakes in mapping paths.
        float fullSimilarity = getFullStringSimilarity(pSearchName, pBlackListName);

        return Math.max(fullSimilarity, mp.relativeWeightedSimilarity);
    }

    /**
     * Get the full text similarity (%) for two text strings passed in. The spaces are deleted
     *
     * @param pSearchName    The search name
     * @param pBlackListName The black list name
     * @return The text similarity in a float
     */
    public float getFullStringSimilarity(String pSearchName, String pBlackListName) {
        PairSimilarity pairSimilarity = new PairSimilarity();
        return pairSimilarity.getSimilarity(pSearchName.replaceAll(" ", ""),
                pBlackListName.replaceAll(" ", ""));
    }

}
