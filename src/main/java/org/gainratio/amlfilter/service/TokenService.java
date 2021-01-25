package org.gainratio.amlfilter.service;

import lombok.Data;
import org.apache.commons.codec.language.DoubleMetaphone;
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
    private static final Logger _logger = LoggerFactory.getLogger(TokenService.class);
    private boolean usePhonetic = false;

    @Autowired
    private EntityService entityService;
    private Map<String, Set<String>> tokenToNamesMap = new HashMap<>();

    @PostConstruct
    public void init() {
        tokenToNamesMap = createTokenToNamesMap();
        _logger.info("tokenToNamesMap.size(): {}", tokenToNamesMap.size());
    }

    private DoubleMetaphone getDoubleMetaphone() {
        DoubleMetaphone dmp = new DoubleMetaphone();
        dmp.setMaxCodeLen(100);
        return dmp;
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
                    token = token.trim();
                    if (usePhonetic) {
                        token = getDoubleMetaphone().doubleMetaphone(token);
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
     * Make the token search and get back the results
     */
    public List<String> tokenSearch(String searchName) {
        String[] searchNameTokens = searchName.split(GeneralConstants.SPACE_TOKEN);
        Set<String> searchNameTokensSet = new HashSet<String>();
        for (String searchNameToken : searchNameTokens) {
            if (StringUtils.isNotBlank(searchNameToken)) {
                searchNameToken = AlgorithmUtils.cleanString(searchNameToken);
                if (searchNameToken.isEmpty()) {
                    continue;
                }
                searchNameToken = searchNameToken.trim();
                if (usePhonetic) {
                    searchNameToken = getDoubleMetaphone().doubleMetaphone(searchNameToken);
                }
                searchNameTokensSet.add(searchNameToken.trim());
            }
        }
        _logger.debug("searchNameTokensSet: " + searchNameTokensSet);
        return getRelevantResults(searchNameTokensSet, generateMatchCountMap(searchNameTokensSet));
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
        for (String token : textTokens) {
            if (StringUtils.isNotBlank(token)) {
                uniqueTokensSet.add(token);
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