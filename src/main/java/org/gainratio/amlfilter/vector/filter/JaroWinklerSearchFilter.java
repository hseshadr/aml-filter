package org.gainratio.amlfilter.vector.filter;

import lombok.Data;
import org.gainratio.amlfilter.algorithms.JaroWinklerDistanceSimilarity;
import org.gainratio.amlfilter.model.Result;
import org.gainratio.amlfilter.service.ResultMatch;
import org.gainratio.amlfilter.service.SearchResultAnalyzerService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

/**
 * The text similarity mapped words search filter
 */
@Data
@Component
public class JaroWinklerSearchFilter implements NameSearchFilter {
    private final int topN = 1;
    private JaroWinklerDistanceSimilarity jaroWinklerDistanceSimilarity = new JaroWinklerDistanceSimilarity();
    public List<Result> filterSearchResults(List<Result> searchResults) {
        List<Result> resultList = searchResults.stream()
                .parallel()
                .map(sr ->
                        resultMatch(sr.getSearchName(), sr.getResultName(), sr))
                .filter(rm -> rm.isMatch())
                .map(rm -> {
                    Result r = rm.getResult();
                    rm.getResult().setTextSimilarity((double)rm.getTextSimilarity());
                    return r;
                })
                .sorted(Comparator.comparing(Result::getTextSimilarity).reversed())
                .limit(topN)
                .collect(Collectors.toList());
        return resultList;
    }

    private ResultMatch resultMatch(String searchName, String resultName, Result result) {
        Double similarity = (double)jaroWinklerDistanceSimilarity.getSimilarity(searchName, resultName);
        ResultMatch resultMatch = new ResultMatch(result, similarity, true);
        return resultMatch;
    }
}