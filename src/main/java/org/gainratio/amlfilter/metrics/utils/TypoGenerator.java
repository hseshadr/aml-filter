package org.gainratio.amlfilter.metrics.utils;

import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.*;

// TODO: refactor 314
public class TypoGenerator {
    private static final Logger logger = LoggerFactory.getLogger(TypoGenerator.class);

    static Random rnd = new Random();
    static Map<String, List<String>> typoMap = new HashMap<String, List<String>>();

    static {
        typoMap.put("A", Arrays.asList("Q", "W", "S", "X", "Z"));
        typoMap.put("B", Arrays.asList("V", "F", "G", "H", "N", "8"));
        typoMap.put("C", Arrays.asList("X", "D", "F", "V"));
        typoMap.put("D", Arrays.asList("C", "X", "S", "E", "R", "F"));
        typoMap.put("E", Arrays.asList("D", "S", "W", "R", "F", "3"));
        typoMap.put("F", Arrays.asList("C", "D", "R", "T", "G", "V"));
        typoMap.put("G", Arrays.asList("V", "F", "T", "Y", "H", "B", "C"));
        typoMap.put("H", Arrays.asList("B", "G", "Y", "U", "J", "N"));
        typoMap.put("I", Arrays.asList("K", "J", "U", "8", "9", "O", "Y"));
        typoMap.put("J", Arrays.asList("N", "H", "U", "I", "K", "M"));
        typoMap.put("K", Arrays.asList("M", "J", "I", "O", "L"));
        typoMap.put("L", Arrays.asList("K", "O", "P"));
        typoMap.put("M", Arrays.asList("N", "J", "K", "W"));
        typoMap.put("N", Arrays.asList("B", "H", "J", "M"));
        typoMap.put("O", Arrays.asList("L", "K", "I", "9", "0", "0", "P", "L"));
        typoMap.put("P", Arrays.asList("L", "O", "0"));
        typoMap.put("Q", Arrays.asList("A", "W", "S", "O", "0"));
        typoMap.put("R", Arrays.asList("F", "D", "E", "T"));
        typoMap.put("S", Arrays.asList("Z", "A", "W", "E", "D", "X", "2"));
        typoMap.put("T", Arrays.asList("F", "R", "Y", "G"));
        typoMap.put("U", Arrays.asList("H", "Y", "I", "J", "V"));
        typoMap.put("V", Arrays.asList("C", "F", "G", "B", "U"));
        typoMap.put("W", Arrays.asList("A", "Q", "E", "S", "M"));
        typoMap.put("X", Arrays.asList("Z", "S", "D", "C"));
        typoMap.put("Y", Arrays.asList("G", "T", "U", "H", "I"));
        typoMap.put("Z", Arrays.asList("A", "S", "X", "S", "2"));
    }

    public static String typoForKey(String keyPressedStr) {
        boolean isUpper = StringUtils.isAllUpperCase(keyPressedStr);
        String keyPressedStrUpper = keyPressedStr.toUpperCase();
        List<String> typoList = typoMap.get(keyPressedStrUpper);
        if (null == typoList) {
            return null;
        }

        int listLen = typoList.size();
        int replacementPos = (int) (rnd.nextDouble() * listLen);
        if (replacementPos==listLen) replacementPos=listLen-1;
        String replacement = typoList.get(replacementPos);
        if (isUpper) {
            return replacement.toUpperCase();
        } else {
            return replacement.toLowerCase();
        }
    }

    public static String injectTypos(String origString, int numTypos) {
        if (numTypos>25) throw new IllegalArgumentException("Maximum allowed typos are 25");
        if (StringUtils.isAllBlank(origString)) throw new IllegalArgumentException("String to modify must have some valid chars.");
        int strLen = origString.length();
        if (numTypos>strLen) throw new IllegalArgumentException("The size of the string must be smaller than the typos to add. Just a typo per char is allowed.");

        String retString = origString;
        Set<Integer> typosPositions = new HashSet<Integer>();
        for (int t=0; t<numTypos; t++) {
            int pos = -1;
            // Get a valid injection position
            int retries = 0;
            while (pos==-1) {
                retries++;
                if (retries>100) break;
                pos = (int) (rnd.nextDouble() * strLen);
                if (pos == strLen) {
                    pos = -1;
                    continue;
                }
                if (typosPositions.contains(pos)) {
                    pos=-1;
                    continue;
                }
                typosPositions.add(pos);
                if (StringUtils.isAllBlank(origString.substring(pos, pos+1))) {
                    pos=-1;
                }
            }
            retString = injectTypo(retString, pos);
        }
        return retString;
    }

    public static String injectTypo(String origString, int pos) {
        if (pos==-1) return origString;
        if (pos>=origString.length()) return origString;
        String origChar = origString.substring(pos, pos+1);
        String typo = typoForKey(origChar);
        if (null==typo) {
            logger.warn("No typo for '"+origChar+"'");
            return origString;
        }
        return origString.substring(0, pos) + typo + origString.substring(pos+1);
    }
}