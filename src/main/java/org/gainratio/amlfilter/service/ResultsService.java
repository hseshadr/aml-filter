/*
 * Copyright (C) 2010 AMLFilter LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package org.gainratio.amlfilter.service;

import lombok.Data;
import org.gainratio.amlfilter.model.Result;
import org.gainratio.amlfilter.model.SearchRecord;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;


import java.util.*;


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
    public Result createResult(SearchRecord pSearchRecord,
                               String pDescription,
                               String pUncleanedSearchName,
                               String pSearchName,
                               String pResultName,
                               String pResultDescription,
                               String pEntityCodeInSource,
                               String pListName,
                               float pTextSimilarity,
                               long pHitTime) {
        Result result = new Result();
        result.setSearchRecord(pSearchRecord);
        result.setDescription(pDescription);
        result.setUncleanedSearchName(pUncleanedSearchName);
        result.setSearchName(pSearchName);
        result.setResultName(pResultName);
        result.setResultNameInformationLevel(getWordService().getNameInformationLevel(pResultName));
        result.setResultDescription(pResultDescription);
        result.setEntityCodeInSource(pEntityCodeInSource);
        result.setListName(pListName);
        result.setTextSimilarity(pTextSimilarity);
        result.setHitTime(pHitTime);

        result.setResultNameInformationLevel(getWordService().getNameInformationLevel(pResultName));
        return result;
    }

    /**
     * Remove result repetitions; the criteria used is by name. Mutiple
     * searches (e.g. original, synonymic) cascaded can return the same results
     * corresponding to the same entity name; this takes care of it.
     *
     * @param pResults The results
     * @return A new list of de-duplicated results
     */
    public final List<Result> removeResultRepetitionsByNameAndSimilarity(List<Result> pResults) {
        final String methodSignature = "List<Result> removeResultRepetitionsByNameAndSimilarity(List<Result>): ";

        // Sort the collection by blackListMember ID + similarity
        Collections.sort(pResults, ResultRepetitionByNameAndSimilarityComparator.getInstance());

        // Create a new result array that will contain the de-duplicated results
        List<Result> newResults = new ArrayList<Result>();

        // The results size
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
        final String methodSignature = "List<Result> removeResultRepetitionsByEntityCodeAndSimilarity(final List<Result>): ";

        Collections.sort(pResults, ResultRepetitionByEntityCodeAndSimilarityComparator.getInstance());

        // Create a new result array that will contain the de-duplicated results
        List<Result> newResults = new ArrayList<Result>();

        // The results size
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
     *
     * @param pResults The results to de-duplicate
     * @return A new list of de-duplicated results
     */
    public final List<Result> removeResultSynonyms(final List<Result> pResults) {
        final String methodSignature = "List<Result> removeResultRepetitions(final List<Result>): ";

        // getLogger().info(getClass(), methodSignature + "pResults: " +
        // getResultsAsString(pResults));
        // Sort the collection by SDN key + blackListName + listName +
        // Similarity
        Collections.sort(pResults, ResultSynonymComparator.getInstance());

        // getLogger().info(getClass(), methodSignature + "Sorted pResults: " +
        // getResultsAsString(pResults));

        // Create a new result array that will contain the de-duplicated results
        List<Result> newResults = new ArrayList<Result>();

        // The results size
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

        // getLogger().info(getClass(), methodSignature +
        // "De-duplicated pResults: " + getResultsAsString(newResults));
        return newResults;
    }
}