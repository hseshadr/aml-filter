package org.gainratio.amlfilter.util;

import java.util.*;
import java.util.stream.Collectors;

public class StringUtils implements GeneralConstants {
    public static List<String> splitDeduplicateAndOrderTokens(String pDataStr, String pDelimiter) {
        Set<String> dedupedSet = Arrays.stream(pDataStr.split(pDelimiter))
                .map(String::trim)
                .collect(Collectors.toCollection(TreeSet::new));
        return new ArrayList<>(dedupedSet);
    }
}
