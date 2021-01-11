package org.gainratio.amlfilter.service;

import lombok.Data;
import org.gainratio.amlfilter.model.Entity;
import org.gainratio.amlfilter.model.SearchRecord;
import org.gainratio.amlfilter.util.AlgorithmUtils;
import org.gainratio.amlfilter.util.GeneralConstants;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.*;

@Service
@Data
public class TokenService {
    public static final float DEFAULT_TOKEN_MATCH_MAGIC_SIMILARITY = 0.9912345f;
    private static final Logger _logger = LoggerFactory.getLogger(TokenService.class);
    private float tokenMatchMagicSimilarity = DEFAULT_TOKEN_MATCH_MAGIC_SIMILARITY;

    @Autowired
    private EntityService entityService;
    Map<String, List<String>> tokenToNamesMap = new HashMap<>();


    public Map<String, List<String>> getTokenToNamesMap() {
        Map<String, List<String>> tokenToNamesMap = new HashMap<>();
        for (Entity entity : entityService.getEntityMap().values()) {
            for (String name : entity.getEntityNameSet()) {
                name = AlgorithmUtils.cleanString(name);
                String[] tokens = name.split(" ");
                for (String token : tokens) {
                    token = AlgorithmUtils.cleanString(token);
                    if (token.isEmpty()) {
                        continue;
                    }
                    List<String> names = tokenToNamesMap.get(token);
                    if (null == names) {
                        tokenToNamesMap.put(token, names);
                    }
                    names.add(name);
                }
            }
        }
        deduplicateNames(tokenToNamesMap);
        return tokenToNamesMap;
    }

    /**
     * Iterate through all the names belonging to a token and deduplicate them
     */
    protected static void deduplicateNames(Map<String, List<String>> pTokenToNamesMap) {
        Set<Map.Entry<String, List<String>>> entrySet = pTokenToNamesMap.entrySet();
        Iterator<Map.Entry<String, List<String>>> entrySetIterator = entrySet.iterator();
        while (entrySetIterator.hasNext()) {
            Map.Entry<String, List<String>> entry = entrySetIterator.next();
            List<String> names = entry.getValue();
            Set<String> nameSet = new HashSet<String>();
            nameSet.addAll(names);
            names.clear();
            names.addAll(nameSet);
            Collections.sort(names);
        }
    }

    /**
     * Get the token cache entry given the list designation and a token
     */
    public List<String> getNamesForToken(String pToken) {
        return tokenToNamesMap.get(pToken);
    }

    /**
     * Generate the black list member name match count map
     */
    protected Map<String, Integer> generateMatchCountMap(Set<String> pSearchNameTokensSet) {
        Map<String, Integer> nameToMatchCountMap = new HashMap<String, Integer>();

        int notFoundCount = 0;
        Integer matchCount = 0;
        Iterator<String> searchNameSetIterator = pSearchNameTokensSet.iterator();
        while (searchNameSetIterator.hasNext()) {
            String searchNameToken = searchNameSetIterator.next();
            List<String> names = getTokenToNamesMap().get(searchNameToken);
            if (null != names) {
                Iterator<String> blmsIterator = names.iterator();
                while (blmsIterator.hasNext()) {
                    String blm = blmsIterator.next();
                    matchCount = nameToMatchCountMap.get(blm);
                    if (null == matchCount) {
                        nameToMatchCountMap.put(blm, 1);
                    } else {
                        nameToMatchCountMap.put(blm, ++matchCount);
                    }
                }
            } else {
                notFoundCount++;
                if (notFoundCount > 1) {
                    break;
                }
            }
        }
        return nameToMatchCountMap;
    }

    /**
     * Get the relevant results
     */
    protected List<String> getRelevantResults(Set<String> pSearchNameTokensSet,
                                              Map<String, Integer> pNameToMatchCountMap) {
        final String methodSignature = "getRelevantResults(Set<String>,Map<String,Integer>): ";
        List<String> results = new ArrayList<String>();
        Iterator<Map.Entry<String, Integer>> blmToMatchCountMapIterator = pNameToMatchCountMap.entrySet().iterator();
        int searchNameTokensListSize = pSearchNameTokensSet.size();
        while (blmToMatchCountMapIterator.hasNext()) {
            Map.Entry<String, Integer> entry = blmToMatchCountMapIterator.next();
            Integer countValue = entry.getValue();

            // # The following avoids dealing with searchName with only one token (word)
            if (searchNameTokensListSize == 1) {
                continue;
            }

            // # The following avoids dealing with searchName and foundName differing in more than one token.
            if (Math.abs(countValue - searchNameTokensListSize) > 1) {
                continue;
            }

            // Counting the number of tokens in the found name
            String bln = entry.getKey();
            int blnTokenCount = countUniqueTokens(bln);

            // # The following avoids dealing with the found-Name's composed of a single token.
            if (blnTokenCount == 1) {
                continue;
            }


            _logger.debug(methodSignature + " ----------------------- ");
            _logger.debug(methodSignature + "Searched Name: " + pSearchNameTokensSet.toString());
            _logger.debug(methodSignature + "Searched Name Token Count: " + searchNameTokensListSize);
            _logger.debug(methodSignature + " ----------------------- ");
            _logger.debug(methodSignature + "bln: " + bln);
            _logger.debug(methodSignature + "blnTokenCount: " + blnTokenCount);
            _logger.debug(methodSignature + " ----------------------- ");
            _logger.debug(methodSignature + "Common tokens: " + countValue);
            _logger.debug(methodSignature + " ----------------------- ");

            // Keep the result
            // NOTE: we allow the names to have the same amount of tokens ( "<=" ).
            if (1 <= Math.abs(searchNameTokensListSize - blnTokenCount) &&
                    (countValue == searchNameTokensListSize || (countValue == blnTokenCount))) {
                results.add(bln);
            }
        }

        return results;
    }

    /**
     * Count the tokens
     */
    public int countTokens(String pText) {
        if (pText.isEmpty()) {
            return 0;
        }
        int count = 1;
        char[] textChars = pText.toCharArray();
        for (int i = 0; i < textChars.length; i++) {
            if (textChars[i] == ' ') {
                count++;
            }
        }
        return count;
    }

    /**
     * Count the unique tokens
     */
    public int countUniqueTokens(String pText) {
        if (pText.isEmpty()) {
            return 0;
        }
        Set<String> uniqueTokensSet = new HashSet<String>();
        String[] textTokens = pText.split(GeneralConstants.SPACE_TOKEN);
        for (int i = 0; i < textTokens.length; i++) {
            if (!textTokens[i].isEmpty()) {
                uniqueTokensSet.add(textTokens[i]);
            }
        }
        return uniqueTokensSet.size();
    }

    /**
     * Make the token search and get back the results (black list names)
     */
    public List<String> tokenSearch(String pSearchName, SearchRecord pSearchRecord) {
        final String methodSignature = "List<String> tokenSearch(String,SearchRecord): ";
        String[] searchNameTokens = pSearchName.split(GeneralConstants.SPACE_TOKEN);
        Set<String> searchNameTokensSet = new HashSet<String>();
        for (int i = 0; i < searchNameTokens.length; i++) {
            if (!searchNameTokens[i].trim().isEmpty()) {
                searchNameTokensSet.add(searchNameTokens[i].trim());
            }
        }
        _logger.debug(methodSignature + "searchNameTokensSet: " + searchNameTokensSet);
        Map<String, Integer> blmToMatchCountMap = generateMatchCountMap(searchNameTokensSet);
        return getRelevantResults(searchNameTokensSet, blmToMatchCountMap);
    }
}