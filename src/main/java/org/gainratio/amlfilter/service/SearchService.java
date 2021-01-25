package org.gainratio.amlfilter.service;

import lombok.Data;
import org.apache.commons.lang3.StringUtils;
import org.gainratio.amlfilter.model.*;
import org.gainratio.amlfilter.search.LuceneSearch;
import org.gainratio.amlfilter.search.TokenSearch;
import org.gainratio.amlfilter.util.AlgorithmUtils;
import org.gainratio.amlfilter.vector.filter.TextSimilarityMappedWordsSearchFilter;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

@Service
@Data
public class SearchService implements SearchServiceInterface {
    @Autowired
    private VectorSpaceService vectorSpaceService;
    @Autowired
    private SynonymService synonymService;
    @Autowired
    private TextSimilarityMappedWordsSearchFilter nameSearchFilter;
    @Autowired
    private ResultsService resultsService;
    @Autowired
    private TokenSearch tokenSearch;
    @Autowired
    private LuceneSearch luceneSearch;
    @Autowired
    private Tree_VectorSpaceSearch tree_vectorSpaceSearch;

    public SearchResponse search(SearchRequest searchRequest) {
        List<SearchRecordResults> searchRecordResultsList = new ArrayList<>();
        for (SearchRecord searchRecord : searchRequest.getSearchRecordList()) {
            String cleanedName = AlgorithmUtils.cleanString(searchRecord.getFullName());
            String synonimicName = getSynonymService().getSynonymName(searchRecord.getFullName());
            searchRecord.setCleanedName(cleanedName);
            searchRecord.setSynonimicName(synonimicName);
            List<Result> resultList = searchVariants(searchRecord);
            resultList = filterResults(resultList);
            searchRecordResultsList.add(SearchRecordResults.builder()
                    .searchRecord(searchRecord).results(resultList).build());
        }
        return SearchResponse.builder().searchRecordResultList(searchRecordResultsList).build();
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

    private List<Result> searchVariants(SearchRecord searchRecord) {
        List<Result> resultList = new ArrayList<>();
        String searchName = AlgorithmUtils.cleanString(searchRecord.getFullName());
        if (StringUtils.isBlank(searchName)) {
            return resultList;
        }
        List<Result> results1 = search(searchName, searchRecord);
        resultList.addAll(results1);
        String synonymicName = getSynonymService().getSynonymName(searchName);
        if (!synonymicName.equals(searchName)) {
            List<Result> results2 = search(synonymicName, searchRecord);
            resultList.addAll(results2);
        }
        return resultList;
    }

    private List<Result> search(String searchName, SearchRecord searchRecord) {
        List<Result> cumulativeResults = new ArrayList<>();

        List<Result> resultListFromTokenSearch = tokenSearch.executeQuery(searchRecord);
        cumulativeResults.addAll(resultListFromTokenSearch);
        List<Result> resultListFromLuceneSearch = luceneSearch.executeQuery(searchRecord);
        cumulativeResults.addAll(resultListFromLuceneSearch);
        List<Result> resultListFromVsSearch = tree_vectorSpaceSearch.executeQuery(searchRecord);
        cumulativeResults.addAll(resultListFromVsSearch);

        cumulativeResults = nameSearchFilter.filterSearchResults(cumulativeResults);
        return cumulativeResults;
    }
}
