package org.gainratio.amlfilter.vector.filter;

import lombok.Data;
import org.gainratio.amlfilter.model.Result;
import org.gainratio.amlfilter.service.SearchResultAnalyzerService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.stream.Collectors;

/**
 * The text similarity mapped words search filter
 */
@Data
@Component
public class TextSimilarityMappedWordsSearchFilter implements NameSearchFilter {
    @Autowired
    private SearchResultAnalyzerService searchResultAnalyzerService;

    public List<Result> filterSearchResults(List<Result> searchResults) {
        // TODO: watch for side effects, beacuse you are editing the result object
        // We can parallelize since each result is its own object, clone the object if needed
        return searchResults.stream()
                .parallel()
                .map(sr -> getSearchResultAnalyzerService()
                        .resultMatch(sr.getSearchName(), sr.getResultName(), sr))
                .filter(rm -> rm.isMatch())
                .map(rm -> {
                    Result r = rm.getResult();
                    rm.getResult().setTextSimilarity(rm.getTextSimilarity());
                    return r;
                })
                .collect(Collectors.toList());
    }
}