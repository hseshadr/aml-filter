package org.gainratio.amlfilter.service;

import lombok.Data;
import org.gainratio.amlfilter.model.Result;
import org.gainratio.amlfilter.model.SearchRecordResults;
import org.gainratio.amlfilter.model.SearchRequest;
import org.gainratio.amlfilter.model.SearchResponse;
import org.gainratio.amlfilter.search.ElasticSearch;
import org.gainratio.amlfilter.service.filter.TextSimilarityMappedWordsSearchFilter;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.List;

@Service
@Data
public class SearchService implements SearchServiceInterface {
    @Autowired
    private SynonymService synonymService;
    @Autowired
    private TextSimilarityMappedWordsSearchFilter nameSearchFilter;
    @Autowired
    private ResultsService resultsService;
    @Autowired
    private ElasticSearch elasticSearch;

    @Override
    public SearchResponse search(SearchRequest searchRequest) {
        SearchResponse searchResponse = elasticSearch.executeQuery(searchRequest);
        for (SearchRecordResults searchRecordResults : searchResponse.getSearchRecordResultList()) {
            List<Result> filteredResults = filterResults(searchRecordResults.getResults());
            searchRecordResults.setResults(filteredResults);
        }
        return searchResponse;
    }


    private List<Result> filterResults(List<Result> results) {
        List<Result> filteredResults = results;
        if (results.size() > 0) {
            // Remove the result repetitions by entity code and similarity
            filteredResults = getResultsService().removeResultRepetitionsByEntityCodeAndSimilarity(filteredResults);
            // Remove the result synonyms
            // *******************************************************************
            filteredResults = getResultsService().removeResultSynonyms(filteredResults);
        }
        Collections.sort(filteredResults, (a, b) -> b.getTextSimilarity().compareTo(a.getTextSimilarity()));
        return filteredResults;
    }

}
