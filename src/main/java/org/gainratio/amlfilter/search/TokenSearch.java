package org.gainratio.amlfilter.search;

import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.extern.slf4j.Slf4j;
import org.gainratio.amlfilter.model.Result;
import org.gainratio.amlfilter.model.SearchRecord;
import org.gainratio.amlfilter.service.EntityService;
import org.gainratio.amlfilter.service.ResultsService;
import org.gainratio.amlfilter.service.SynonymService;
import org.gainratio.amlfilter.service.TokenService;
import org.gainratio.amlfilter.util.AlgorithmUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * Implements the name search interface in a manner that
 * performs a vector space search.
 */
@Component
@Data
@EqualsAndHashCode(callSuper = false)
@Slf4j
public class TokenSearch extends NameSearch {
    private static final Logger logger = LoggerFactory.getLogger(TokenSearch.class);
    @Autowired
    private ResultsService resultsService;
    @Autowired
    private SynonymService synonymService;
    @Autowired
    private TokenService tokenService;
    @Autowired
    private EntityService entityService;

    private boolean enabled = true;

    /**
     * Execute the query, in this case by invoking a phonetic
     * search in blacklist and then convert the blacklist members
     * into result objects
     */
    @Override
    public List<Result> executeQuery(SearchRecord searchRecord) {
        long startTime = System.nanoTime();
        List<Result> finalResults = new ArrayList<>();
        if (!enabled) {
            return finalResults;
        }
        try {
            List<String> cumulativeSearchResults = new ArrayList<String>();
            List<String> resultNames = getTokenService().tokenSearch(searchRecord.getCleanedName());
            cumulativeSearchResults.addAll(resultNames);
            if (!searchRecord.getCleanedName().equals(searchRecord.getSynonimicName())) {
                resultNames = getTokenService().tokenSearch(searchRecord.getSynonimicName());
                cumulativeSearchResults.addAll(resultNames);
            }
            finalResults = assembleResults(cumulativeSearchResults, searchRecord);
        } catch (Exception e) {
            log.error("ERROR: ", e);
        } finally {
            if (Math.abs(startTime%500)==16) {
                long endTime = System.nanoTime();
                logger.info("Search time(ms): {}", (double)(endTime-startTime)/1000000d);
            }
        }
        return finalResults;
    }


    /**
     * Assemble result objects out of the vector result object
     */
    public List<Result> assembleResults(List<String> searchResultNameList,
                                        SearchRecord searchRecord) {
        List<Result> results = new ArrayList<>();
        String searchName = AlgorithmUtils.cleanString(searchRecord.getFullName());

        for (String searchResultName : searchResultNameList) {
            Set<String> entityCodeSet = getEntityService().getEntityCodesForName(searchResultName);
            for (String entityCode : entityCodeSet) {
                Result result = getResultsService().createResult(searchName,
                        searchResultName, entityCode, "SDN", getClass().getSimpleName(),
                        1d);

                results.add(result);
            }
        }
        return results;
    }
}
