package org.gainratio.amlfilter.algorithms;


import org.apache.commons.collections4.SetUtils;
import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import java.util.stream.Collectors;

public class NewPairSimilarity {
    private Logger logger = LoggerFactory.getLogger(getClass());

    public String normalize(String text) {
        String normText = Arrays.stream(text.trim().split(" "))
                .map(s -> s.trim().toUpperCase())
                .collect(Collectors.joining(" "));
        normText = " " + normText + " ";
        return normText;
    }

    public Set<String> pairSet(String text) {
        Set<String> pairSet = new HashSet<>();
        int textLength = text.length() - 1;
        for (int i = 0; i < textLength; i++) {
            StringBuilder pairBuffer = new StringBuilder();
            char firstCharacter = text.charAt(i);
            char nextCharacter = text.charAt(i + 1);
            pairBuffer.append(firstCharacter).append(nextCharacter);
            String pair = pairBuffer.toString();
            if (StringUtils.isNotBlank(pair)) {
                pairSet.add(pair);
            }
        }
        return pairSet;
    }

    public double similarity(String text1, String text2) {
        String normText1 = normalize(text1);
        String normText2 = normalize(text2);
        logger.info("normText1={}, normText2={}", normText1, normText2);
        Set<String> pairSet1 = pairSet(normText1);
        Set<String> pairSet2 = pairSet(normText2);
        logger.info("pairSet1={}, pairSet2={}", pairSet1, pairSet2);
        SetUtils.SetView<String> intersectSet = SetUtils.intersection(pairSet1, pairSet2);
        return (double) intersectSet.size() * 2f / (double) (pairSet1.size() + pairSet2.size());
    }
}
