

/*
 * Created on 25-abr-2005
 *
 * TODO To change the template for this generated file go to
 * Window - Preferences - Java - Code Style - Code Templates
 */
package org.gainratio.amlfilter.service;

import org.gainratio.amlfilter.util.AlgorithmUtils;

import java.util.ArrayList;

public class AlgorithmsService implements AlgorithmsServiceInterface {
    /**
     * Get phone from char, groups of characters equate to the same value
     */
    public static int getPhoneFromChar(char pChar) {
        return AlgorithmUtils.getPhoneFromChar(pChar);
    }

    /**
     * Get the phonetic string out of the text
     */
    public static String getPhoneticString(String pText) {
        return AlgorithmUtils.getPhoneticString(pText);
    }

    /**
     * Get the phonetic string for pair similarities, where characters
     * of the name have more significance than spaces; out of the text
     */
    public static String getPhoneticStringForPairSimilarities(String pText) {
        return AlgorithmUtils.getPhoneticStringForPairSimilarities(pText);
    }

    public static String cleanString(String pText) {
        return AlgorithmUtils.cleanString(pText);
    }

    /**
     * Clean the string and remove any spaces that are inside the string
     */
    public static String cleanStringAndRemoveSpaces(String pText) {
        return AlgorithmUtils.cleanStringAndRemoveSpaces(pText);
    }

    /**
     * Clean the string and remove any additional chars that are inside the string
     */
    public static String cleanStringAndExtraChars(String pText, char[] pCharsToRemove) {
        return AlgorithmUtils.cleanStringAndExtraChars(pText, pCharsToRemove);
    }

    /**
     * Checks to see if the character is valid
     * based on a range check between [A-Z] or [0-9] or being a space
     */
    public static boolean isValidCharacter(char pCharacterToEvaluate) {
        return AlgorithmUtils.isValidCharacter(pCharacterToEvaluate);
    }

    public float getPairSimilarities(String pText1, String pText2) {
        return AlgorithmUtils.getPairSimilarities(pText1, pText2);
    }

    protected ArrayList<String> getPairs(String pText) {
        return AlgorithmUtils.getPairs(pText);
    }

    public String cleanIdValue(String pIDValue) {
        return AlgorithmUtils.cleanIdValue(pIDValue);
    }
}
