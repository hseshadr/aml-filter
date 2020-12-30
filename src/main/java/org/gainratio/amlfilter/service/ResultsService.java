package org.gainratio.amlfilter.service;

import lombok.Data;
import org.gainratio.amlfilter.model.Result;
import org.gainratio.amlfilter.model.SearchRecord;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;


/**
 * Provides a bunch of methods that allow for the management of results. 1)
 * Retrieving results for UI display 2) Updating results in the DB 3) Creating
 * different variations of result objects
 */
@Data
@Service
public class ResultsService implements ResultsServiceInterface {
    @Autowired
    private WordService wordService;

    public Result createResult(String searchName,
                               String resultName,
                               String entityCode,
                               String listName,
                               float textSimilarity) {
        Result result = new Result();
        result.setSearchName(searchName);
        result.setResultName(resultName);
        result.setResultNameInformationLevel(getWordService().getNameInformationLevel(resultName));
        result.setEntityCodeInSource(entityCode);
        result.setListName(listName);
        result.setTextSimilarity(textSimilarity);
        return result;
    }

    /**
     * Remove result repetitions; the criteria used is by name. Mutiple
     * searches (e.g. original, synonymic) cascaded can return the same results
     * corresponding to the same entity name; this takes care of it.
     */
    public final List<Result> removeResultRepetitionsByNameAndSimilarity(List<Result> pResults) {
        Collections.sort(pResults, new ResultRepetitionByNameAndSimilarityComparator());
        List<Result> newResults = new ArrayList<Result>();
        int resultsSize = pResults.size();
        String lastName = "";
        for (int i = 0; i < resultsSize; i++) {
            Result result = pResults.get(i);
            String name = result.getResultName();
            if (!name.equals(lastName)) {
                newResults.add(result);
            }
            lastName = name;
        }
        return newResults;
    }

    /**
     * Remove result repetitions; the criteria used is by entity code and similarity
     *
     * @param pResults The results
     * @return A new list of de-duplicated results
     */
    public final List<Result> removeResultRepetitionsByEntityCodeAndSimilarity(List<Result> pResults) {
        Collections.sort(pResults, new ResultRepetitionByEntityCodeAndSimilarityComparator());
        List<Result> newResults = new ArrayList<Result>();
        int resultsSize = pResults.size();
        String lastEntityCodeInSource = "";
        for (int i = 0; i < resultsSize; i++) {
            Result result = pResults.get(i);
            String entityCodeInSource = result.getEntityCodeInSource();
            if (!entityCodeInSource.equals(lastEntityCodeInSource)) {
                newResults.add(result);
            }
            lastEntityCodeInSource = entityCodeInSource;
        }
        return newResults;
    }

    /**
     * Remove result synonyms; the criteria used is by entity code in list, list
     * name, and the uncleaned name
     */
    public final List<Result> removeResultSynonyms(final List<Result> pResults) {
        Collections.sort(pResults, new ResultSynonymComparator());
        List<Result> newResults = new ArrayList<Result>();
        int resultsSize = pResults.size();

        String lastComparisonToken = "";
        for (int i = 0; i < resultsSize; i++) {
            Result result = pResults.get(i);
            String entityCodeInSource = result.getEntityCodeInSource();
            String blackListName = result.getResultName();
            String publicSuspectInfoListName = result.getListName();

            StringBuilder comparisonTokenBuffer = new StringBuilder();
            comparisonTokenBuffer.append(entityCodeInSource);
            comparisonTokenBuffer.append("_");
            comparisonTokenBuffer.append(blackListName);
            comparisonTokenBuffer.append("_");
            comparisonTokenBuffer.append(publicSuspectInfoListName);
            String comparisonToken = comparisonTokenBuffer.toString();
            if (!comparisonToken.equals(lastComparisonToken)) {
                newResults.add(result);
            }

            lastComparisonToken = comparisonToken;
        }
        return newResults;
    }
}