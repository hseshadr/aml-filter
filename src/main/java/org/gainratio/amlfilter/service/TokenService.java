package org.gainratio.amlfilter.service;

import lombok.Data;
import org.apache.commons.lang3.StringUtils;
import org.gainratio.amlfilter.model.Entity;
import org.gainratio.amlfilter.util.AlgorithmUtils;
import org.gainratio.amlfilter.util.GeneralConstants;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
import java.util.*;

@Service
@Data
public class TokenService {
    public static final float DEFAULT_TOKEN_MATCH_MAGIC_SIMILARITY = 0.993f;
    private static final Logger _logger = LoggerFactory.getLogger(TokenService.class);
    private float tokenMatchMagicSimilarity = DEFAULT_TOKEN_MATCH_MAGIC_SIMILARITY;

    @Autowired
    private EntityService entityService;
    private Map<String, Set<String>> tokenToNamesMap = new HashMap<>();

    @PostConstruct
    void init() {
        tokenToNamesMap = createTokenToNamesMap();
        _logger.info("tokenToNamesMap.size(): {}", tokenToNamesMap.size());
    }


    private Map<String, Set<String>> createTokenToNamesMap() {
        Map<String, Set<String>> tokenToNamesMap = new HashMap<>();
        for (Entity entity : entityService.getEntityCodeToEntityMap().values()) {
            for (String name : entity.getEntityNameSet()) {
                name = AlgorithmUtils.cleanString(name);

                String[] tokens = name.split(" ");
                for (String token : tokens) {
                    token = AlgorithmUtils.cleanString(token);
                    if (token.isEmpty()) {
                        continue;
                    }
                    Set<String> namesSet = tokenToNamesMap.get(token);
                    if (null == namesSet) {
                        namesSet = new HashSet<>();
                        tokenToNamesMap.put(token, namesSet);
                    }
                    namesSet.add(name);
                }
            }
        }
        return tokenToNamesMap;
    }

    /**
     * Get the token cache entry given the list designation and a token
     */
    public Set<String> getNamesForToken(String pToken) {
        return tokenToNamesMap.get(pToken);
    }

    /**
     * Make the token search and get back the results
     */
    public List<String> tokenSearch(String searchName) {
        String[] searchNameTokens = searchName.split(GeneralConstants.SPACE_TOKEN);
        Set<String> searchNameTokensSet = new HashSet<String>();
        for (String searchNameToken : searchNameTokens) {
            if (StringUtils.isNotBlank(searchNameToken)) {
                searchNameTokensSet.add(searchNameToken);
            }
        }
        _logger.debug("searchNameTokensSet: " + searchNameTokensSet);
        return getRelevantResults(searchNameTokensSet, generateMatchCountMap(searchNameTokensSet));
    }

    /**
     * Count the tokens
     */
    private int countTokens(String text) {
        if (text.isEmpty()) {
            return 0;
        }
        int count = 1;
        char[] textChars = text.toCharArray();
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
    private int countUniqueTokens(String text) {
        if (text.isEmpty()) {
            return 0;
        }
        Set<String> uniqueTokensSet = new HashSet<String>();
        String[] textTokens = text.split(GeneralConstants.SPACE_TOKEN);
        for (int i = 0; i < textTokens.length; i++) {
            if (!textTokens[i].isEmpty()) {
                uniqueTokensSet.add(textTokens[i]);
            }
        }
        return uniqueTokensSet.size();
    }

    /**
     * Generate the black list member name match count map
     */
    private Map<String, Integer> generateMatchCountMap(Set<String> searchNameTokensSet) {
        Map<String, Integer> nameToMatchCountMap = new HashMap<String, Integer>();

        int notFoundCount = 0;
        Integer matchCount = 0;
        for (String searchNameToken : searchNameTokensSet) {
            Set<String> nameSet = getTokenToNamesMap().get(searchNameToken);
            if (null != nameSet) {
                for (String name : nameSet) {
                    matchCount = nameToMatchCountMap.get(name);
                    if (null == matchCount) {
                        nameToMatchCountMap.put(name, 1);
                    } else {
                        nameToMatchCountMap.put(name, ++matchCount);
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
    private List<String> getRelevantResults(Set<String> searchNameTokensSet,
                                              Map<String, Integer> nameToMatchCountMap) {
        List<String> results = new ArrayList<String>();
        int searchNameTokensListSize = searchNameTokensSet.size();
        for (Map.Entry<String, Integer> entry : nameToMatchCountMap.entrySet()) {
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


            _logger.debug(" ----------------------- ");
            _logger.debug("Searched Name: " + searchNameTokensSet.toString());
            _logger.debug("Searched Name Token Count: " + searchNameTokensListSize);
            _logger.debug(" ----------------------- ");
            _logger.debug("bln: " + bln);
            _logger.debug("blnTokenCount: " + blnTokenCount);
            _logger.debug(" ----------------------- ");
            _logger.debug("Common tokens: " + countValue);
            _logger.debug(" ----------------------- ");

            // Keep the result
            // NOTE: we allow the names to have the same amount of tokens ( "<=" ).
            if (1 <= Math.abs(searchNameTokensListSize - blnTokenCount) &&
                    (countValue == searchNameTokensListSize || (countValue == blnTokenCount))) {
                results.add(bln);
            }
        }

        return results;
    }
}