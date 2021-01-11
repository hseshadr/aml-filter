package org.gainratio.amlfilter.service;

import lombok.Data;
import org.apache.commons.lang3.StringUtils;
import org.gainratio.amlfilter.model.*;
import org.gainratio.amlfilter.util.AlgorithmUtils;
import org.gainratio.amlfilter.vector.filter.TextSimilarityMappedWordsSearchFilter;
import org.gainratio.amlfilter.vector.vectorSpace.flat.VectorResult;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;

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

    public SearchResponse search(SearchRequest searchRequest) {
        List<SearchRecordResults> searchRecordResultsList = new ArrayList<>();
        for (SearchRecord searchRecord : searchRequest.getSearchRecordList()) {
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
            filteredResults = getResultsService().removeResultRepetitionsByEntityCodeAndSimilarity(filteredResults);
            filteredResults = getResultsService().removeResultSynonyms(filteredResults);
            /*
            filteredResults = getResultsService().removeResultRepetitionsByNameAndSimilarity(results);
             */
        }
        Collections.sort(filteredResults, (a,b) -> b.getTextSimilarity().compareTo(a.getTextSimilarity()));
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
        List<Result> results2 = search(synonymicName, searchRecord);
        resultList.addAll(results2);

        return resultList;
    }

    private List<Result> search(String searchName, SearchRecord searchRecord) {
        List<VectorResult> vectorResultList = vectorSpaceService
                .getVectorSpaceFlat().search(searchName, 200);
        List<Result> resultList
                = convertVectorResultListToSearchResultList(searchName, searchRecord, vectorResultList);
        resultList = nameSearchFilter.filterSearchResults(resultList);
        return resultList;
    }

    private List<Result> convertVectorResultListToSearchResultList(String searchName,
                                                                   SearchRecord searchRecord,
                                                                   List<VectorResult> vectorResultList) {
        return vectorResultList.stream().map(vr -> resultsService.createResult(
                searchName, vr.getName(), vr.getFoundVectorDataFlat().getId(), "", -1f))
                .collect(Collectors.toList());
    }
}
