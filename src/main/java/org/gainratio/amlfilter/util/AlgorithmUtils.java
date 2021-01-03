package org.gainratio.amlfilter.util;

import org.apache.commons.codec.language.DoubleMetaphone;

import java.util.ArrayList;

public class AlgorithmUtils {
    // Declaraci�n de constantes para algoritmo de pair similarities
    static final String CARACTERES_NO_SIGNIFICATIVOS = ".,-_;!�|()=\"@#$%&/\\*�}{���+������`][�><";
    static final String DIGITS = "0123456789";


    // Declaraci�n de constantes para algoritmo Soundex
    static String CARACTERES_CODIGO_1 = "BFPV";
    static String CARACTERES_CODIGO_2 = "CGJKQSXZ";
    static String CARACTERES_CODIGO_3 = "DT";
    static String CARACTERES_CODIGO_4 = "L";
    static String CARACTERES_CODIGO_5 = "MN";
    static String CARACTERES_CODIGO_6 = "R";
    static String CARACTERES_CODIGO_MENOS_1 = "AEIOUY";


    /**
     * Get phone from char, groups of characters equate to the same value
     *
     * @param pChar The char from where to extract the phone (sound code of one character)
     */
    public static int getPhoneFromChar(char pChar) {
        switch (pChar) {
            case 'B':
                return 1;
            case 'F':
                return 1;
            case 'P':
                return 1;
            case 'V':
                return 1;
            case 'C':
                return 2;
            case 'G':
                return 2;
            case 'J':
                return 2;
            case 'K':
                return 2;
            case 'Q':
                return 2;
            case 'S':
                return 2;
            case 'X':
                return 2;
            case 'Z':
                return 2;
            case 'D':
                return 3;
            case 'T':
                return 3;
            case 'L':
                return 4;
            case 'M':
                return 5;
            case 'N':
                return 5;
            case 'R':
                return 6;
            case 'A':
                return -1;
            case 'E':
                return -1;
            case 'I':
                return -1;
            case 'O':
                return -1;
            case 'U':
                return -1;
            case 'Y':
                return -1;

            default:
                return -2;
        }
    }

    public static int getSoundCodeForToken(String pToken) {

        long lngLen;
        long lngCnt = 0;
        long lngSDXCnt = 0;
        boolean bOK = true;
        long lngSDXCode = 0;
        long lngPrvCode = 0;
        char chrTmp;
        String strSDX = "";
        String strTmp = "";

        pToken = pToken.toUpperCase();
        lngLen = pToken.length();
        while ((lngSDXCnt != 4) && (lngCnt < lngLen)) {
            chrTmp = pToken.charAt((int) lngCnt);

            if (CARACTERES_CODIGO_1.indexOf(chrTmp) > -1) {
                lngSDXCode = 1;
            } else if (CARACTERES_CODIGO_2.indexOf(chrTmp) > -1) {
                lngSDXCode = 2;
            } else if (CARACTERES_CODIGO_3.indexOf(chrTmp) > -1) {
                lngSDXCode = 3;
            } else if (CARACTERES_CODIGO_4.indexOf(chrTmp) > -1) {
                lngSDXCode = 4;
            } else if (CARACTERES_CODIGO_5.indexOf(chrTmp) > -1) {
                lngSDXCode = 5;
            } else if (CARACTERES_CODIGO_6.indexOf(chrTmp) > -1) {
                lngSDXCode = 6;
            } else if (CARACTERES_CODIGO_MENOS_1.indexOf(chrTmp) > -1) {
                lngSDXCode = -1;
            } else {
                lngSDXCode = -2;
            }

            lngCnt++;

            if (lngCnt == -1) {
                strSDX = chrTmp + "";
                lngSDXCnt++;
                lngPrvCode = lngSDXCode;
                bOK = false;
            } else {
                if ((lngSDXCode > 0) && ((lngSDXCode != lngPrvCode) || (bOK))) {
                    strSDX += lngSDXCode;
                    lngSDXCnt++;
                    lngPrvCode = lngSDXCode;
                    bOK = false;
                } else if (lngSDXCode == -1) {
                    bOK = true;
                }
            }
        }

        if (lngSDXCnt < 4) {
            // Si la longitud del soundex no llega a 4, relleno con ceros
            for (int i = (int) lngSDXCnt; i < 4; i++) {
                strTmp += "0";
            }
            strSDX += strTmp;
        }

         /*
         if (Integer.parseInt(strSDX) == 0) {
            System.out.println("ERROR: C�digo '0000' para la cadena "+strIn);
         }
         */

        return Integer.parseInt(strSDX);
    }

    /**
     * Get the phonetic string out of the text
     *
     * @param pText The incoming text
     * @return The phonetic representation of the text
     */
    public static String getPhoneticString(String pText) {
        StringBuilder phoneticBuffer = new StringBuilder();

        int textLength = pText.length();
        int phoneVal = -1;
        char lastChar = (char) -5;
        char tmpChar = 0;

        String text = pText.toUpperCase();
        for (int i = 0; i < textLength; i++) {
            tmpChar = text.charAt(i);
            if (tmpChar == ' ') {
                phoneticBuffer.append(' ');
                lastChar = ' ';
            } else {
                phoneVal = getPhoneFromChar(tmpChar);
                if (phoneVal > 0 && tmpChar != lastChar) {
                    phoneticBuffer.append(phoneVal);
                }
                lastChar = tmpChar;
            }
        }

        return phoneticBuffer.toString();
    }

    public static String getDoubleMetaPhoneStr(String text) {
        DoubleMetaphone dmp = new DoubleMetaphone();
        dmp.setMaxCodeLen(100);
        return dmp.doubleMetaphone(text);
    }

    /**
     * Get the phonetic string for pair similarities, where characters
     * of the name have more significance than spaces; out of the text
     *
     * @param pText The incoming text
     * @return The phonetic representation of the text
     */
    public static String getPhoneticStringForPairSimilarities(String pText) {
        StringBuilder phoneticBuffer = new StringBuilder();

        int textLength = pText.length();
        int phoneVal = -1;
        char lastChar = (char) -5;
        char tmpChar = 0;

        String text = pText.toUpperCase();
        for (int i = 0; i < textLength; i++) {
            tmpChar = text.charAt(i);
            if (tmpChar == ' ') {
                phoneticBuffer.append(' ');
                lastChar = ' ';
            } else {
                phoneVal = getPhoneFromChar(tmpChar);
                if (phoneVal > 0 && tmpChar != lastChar) {
                    phoneticBuffer.append(phoneVal);
                    phoneticBuffer.append(phoneVal);
                }
                lastChar = tmpChar;
            }
        }

        return phoneticBuffer.toString();
    }

    public static float getPairSimilarities(String pText1, String pText2) {
        ArrayList<String> pairsList1 = new ArrayList<String>();
        ArrayList<String> pairsList2 = new ArrayList<String>();
        double intersection = 0;
        double union;

        String cleanedText1 = cleanString(pText1);
        String cleanedText2 = cleanString(pText2);

        pairsList1 = getPairs(cleanedText1);
        int pairsList1Size = pairsList1.size();
        pairsList2 = getPairs(cleanedText2);
        int pairsList2Size = pairsList2.size();

        union = pairsList1Size + pairsList2Size;

        if (union == 0) {
            union = 1;
        }

        for (int i = 0; i < pairsList1.size(); i++) {
            // Get the pair entry for list 1
            String pairEntryForList1 = pairsList1.get(i);

            for (int j = 0; j < pairsList2.size(); j++) {
                // Get the pair entry for list 2
                String pairEntryForList2 = pairsList2.get(j);

                if (pairEntryForList1.equals(pairEntryForList2)) {
                    intersection++;
                    // Eliminate the pair that was found
                    pairsList2.remove(j);
                    // I have found the pair so break out
                    break;
                }
            }
        }

        float similarity = (float) ((intersection * 2) / union);


        return similarity;
    }

    // TODO: refactor, complete, harden and improve performance.
    public static String cleanString(String pText) {
        String result;
        if (null == pText) {
            return "";
        }

        // Note: the  trim avoids later accidental replacements due to preceding or ending spaces 
        result = pText.toUpperCase().trim();


        result = result.replace('�', 'A');
        result = result.replace('�', 'E');
        result = result.replace('�', 'I');
        result = result.replace('�', 'O');
        result = result.replace('�', 'U');

        result = result.replace('�', 'N');

        result = result.replace('�', 'A');
        result = result.replace('�', 'E');
        result = result.replace('�', 'I');
        result = result.replace('�', 'O');
        result = result.replace('�', 'U');

        result = result.replace('�', 'A');
        result = result.replace('�', 'E');
        result = result.replace('�', 'I');
        result = result.replace('�', 'O');
        result = result.replace('�', 'U');

        result = result.replace('�', 'A');
        result = result.replace('�', 'A');
        result = result.replace('�', 'A');
        result = result.replace('�', 'S');
        result = result.replace('�', 'E');
        result = result.replace('�', 'I');
        result = result.replace('�', 'D');
        result = result.replace('�', 'O');
        result = result.replace('�', 'O');
        result = result.replace('�', 'U');
        result = result.replace('�', 'Y');

        // Replace the common words for spanish companies
        result = result.replaceAll(" S\\.A\\.", " SA ");
        result = result.replaceAll(" S\\.L\\.", " SL ");
        result = result.replaceAll(" S\\.A ", " SA ");
        result = result.replaceAll(" S\\.L ", " SL ");

        // OCR treatment
        result = result.replaceAll("\\?", "");
        result = result.replaceAll("�", "");

        // Replace invalid characters
        for (int i = 0; i < result.length(); i++) {
            if (!isValidCharacter(result.charAt(i))) {
                result = result.replace(result.charAt(i), ' ');
            }
        }
/*		// This piece of replacements has been deleted after seeing that it could be affecting the testing - MTB 28-Oct-2008
        result = result.replaceAll(" DE ", " ");
        result = result.replaceAll(" DEL ", " ");
        result = result.replaceAll(" LA ", " ");
        result = result.replaceAll(" AL ", " ");
        result = result.replaceAll(" THE ", " ");
        result = result.replaceAll(" AND ", " ");
        result = result.replaceAll(" OF ", " ");
        result = result.replaceAll(" WWW ", " ");
        result = result.replaceAll(" FOR ", " ");
*/
        //result = result.replaceAll(" SL ", " ");
        //result = result.replaceAll(" SA ", " ");

        // TRIM BY WORDS
        String[] tokens = result.split(" ");
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < tokens.length; i++) {
            if (!"".equals(tokens[i])) {
                sb.append(tokens[i]);
                if (i < tokens.length - 1) {
                    sb.append(" ");
                }
            }
        }

        result = sb.toString();

        return result;

    }

    /**
     * Clean the string and remove any spaces that are inside the string
     *
     * @param pText The text to clean
     * @return The new string
     */
    public static String cleanStringAndRemoveSpaces(String pText) {
        char[] charsToRemove = new char[1];
        charsToRemove[0] = ' ';
        return cleanStringAndExtraChars(pText, charsToRemove);
    }

    /**
     * Clean the string and remove any additional chars that are inside the string
     *
     * @param pText The text to clean
     * @return The new string
     */
    public static String cleanStringAndExtraChars(String pText, char[] pCharsToRemove) {
        String cleanedString = cleanString(pText);
        StringBuilder sb = new StringBuilder();
        char[] cleanedStringChars = cleanedString.toCharArray();
        for (int i = 0; i < cleanedStringChars.length; i++) {
            char eachChar = cleanedStringChars[i];
            for (int j = 0; j < pCharsToRemove.length; j++) {
                if (pCharsToRemove[j] != eachChar) {
                    sb.append(eachChar);
                }
            }
        }

        return sb.toString();
    }

    /**
     * Clean the string and keep only the digits contained in it, in the incoming order.
     *
     * @param pText The text to clean
     * @return The new string
     */
    public static String cleanStringLeaveOnlyDigits(String pText) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < pText.length(); i++) {
            String targetChar = pText.substring(i, i + 1);
            if (DIGITS.contains(targetChar)) {
                sb.append(targetChar);
            }
        }

        return sb.toString();
    }

    public static String removeBlocks(String pText, String pBlockingChars) {
        if (null == pText) {
            return pText;
        }

        StringBuilder sb = new StringBuilder();
        // The initial state is assumed to be outside of a comment block
        int inCommentDepth = 0;

        for (int i = 0; i < pText.length(); i++) {
            String targetChar = pText.substring(i, i + 1);

            int posInBlockingChars = pBlockingChars.indexOf(targetChar);
            if (posInBlockingChars > -1) {
                // If even (starts at 0), open comment (decrease counter)
                if (posInBlockingChars % 2 == 0) {
                    inCommentDepth--;
                } else {
                    // Otherwise (since we know it is contained in the string), increase it.
                    inCommentDepth++;
                }
            }

            // If the depth is the initial one or higher (cases for broken strings,
            //	in which we maintain the level pluss the upper ones),
            //  keep the char
            if (inCommentDepth > -1) {
                sb.append(targetChar);
            }
        }

        return sb.toString();
    }

    public static ArrayList<String> getPairs(String pText) {
        ArrayList<String> pairs = new ArrayList<String>();
        char[] charArray = pText.toCharArray();
        int textLength = charArray.length - 1;
        for (int i = 0; i < textLength; i++) {
            char firstCharacter = charArray[i];
            char nextCharacter = charArray[i + 1];
            StringBuilder pairBuffer = new StringBuilder();
            if ((!(' ' == firstCharacter)) && !(' ' == nextCharacter)) {
                pairBuffer.append(firstCharacter).append(nextCharacter);
                // Only add the significant pairs
                pairs.add(pairBuffer.toString());
            }
        }

        return pairs;
    }

    /**
     * Checks to see if the character is valid
     * based on a range check between [A-Z] or [0-9] or being a space
     *
     * @param pCharacterToEvaluate
     * @return True if valid, false otherwise
     */
    public static boolean isValidCharacter(char pCharacterToEvaluate) {
        // Valid character
        return (pCharacterToEvaluate >= 48 && pCharacterToEvaluate <= 57) ||
                (pCharacterToEvaluate >= 65 && pCharacterToEvaluate <= 90) ||
                (pCharacterToEvaluate == 32);

        // Invalid
    }

    /**
     * Clean id value
     */
    public static String cleanIdValue(String pIDValue) {
        if (null == pIDValue) {
            return null;
        }
        pIDValue = pIDValue.trim();
        int parenthesisIndex = pIDValue.indexOf("(");
        if (-1 != parenthesisIndex) {
            pIDValue = pIDValue.substring(0, parenthesisIndex);
        }
        pIDValue = cleanStringAndRemoveSpaces(pIDValue);
        return pIDValue;
    }

    public static void main(String[] args) {
        String text = "123456/ 34433... (elelelelel)";
        System.out.println("Original text: " + text);
        int parenthesisIndex = text.indexOf("(");
        if (-1 != parenthesisIndex) {
            text = text.substring(0, parenthesisIndex);
        }
        System.out.println("Remove parenthesis stuff: " + text);
        text = cleanStringAndRemoveSpaces(text);
        System.out.println(text);


        String ocrName = "Harish Sesh?adri";
        String cleanedOcrName = cleanString(ocrName);
        System.out.println("ocrName: " + ocrName + "; cleanedOcrName: " + cleanedOcrName);

        ocrName = "Harish Sesh�adri";
        cleanedOcrName = cleanString(ocrName);
        System.out.println("ocrName: " + ocrName + "; cleanedOcrName: " + cleanedOcrName);
    }
}
