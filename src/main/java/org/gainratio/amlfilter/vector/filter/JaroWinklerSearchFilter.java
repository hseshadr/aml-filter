package org.gainratio.amlfilter.vector.filter;

import lombok.Data;
import org.gainratio.amlfilter.algorithms.JaroWinklerDistanceSimilarity;
import org.gainratio.amlfilter.model.Result;
import org.gainratio.amlfilter.service.ResultMatch;
import org.springframework.stereotype.Component;

import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;

/**
 * The text similarity mapped words search filter
 */
@Data
@Component
public class JaroWinklerSearchFilter implements NameSearchFilter {
    private double similarityThreshold = 0.95d;
    private JaroWinklerDistanceSimilarity jaroWinklerSimilarity = new JaroWinklerDistanceSimilarity();

    public List<Result> filterSearchResults(List<Result> searchResults) {
        List<Result> resultList = searchResults.stream()
                .parallel()
                .map(sr ->
                        resultMatch(sr.getSearchName(), sr.getResultName(), sr))
                .filter(rm -> rm.isMatch())
                .map(rm -> {
                    Result r = rm.getResult();
                    rm.getResult().setTextSimilarity(rm.getTextSimilarity());
                    return r;
                })
                .sorted(Comparator.comparing(Result::getTextSimilarity).reversed())
                .collect(Collectors.toList());
        return resultList;
    }

    private ResultMatch resultMatch(String searchName, String resultName, Result result) {
        boolean match;
        Double similarity = (double) jaroWinklerSimilarity.getSimilarity(searchName, resultName);
        if (similarity >= similarityThreshold) {
            match = true;
        }
        else {
            match = false;
        }
        return new ResultMatch(result, similarity, match);
    }
}