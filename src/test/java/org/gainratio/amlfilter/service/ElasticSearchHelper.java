package org.gainratio.amlfilter.service;

import org.apache.commons.io.IOUtils;
import org.elasticsearch.action.admin.indices.delete.DeleteIndexRequest;
import org.elasticsearch.client.RequestOptions;
import org.elasticsearch.client.RestHighLevelClient;
import org.elasticsearch.client.indices.CreateIndexRequest;
import org.elasticsearch.client.indices.CreateIndexResponse;
import org.elasticsearch.client.indices.GetIndexRequest;
import org.elasticsearch.common.xcontent.XContentType;
import org.gainratio.amlfilter.model.*;
import org.gainratio.amlfilter.repository.EntityCodeAndNamesRepository;
import org.gainratio.amlfilter.util.ResourceUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.elasticsearch.core.SearchHit;
import org.springframework.data.elasticsearch.core.SearchHits;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.Charset;
import java.util.*;
import java.util.concurrent.atomic.AtomicLong;

@Component
public class ElasticSearchHelper implements SearchServiceInterface {
    private Logger logger = LoggerFactory.getLogger(getClass());
    @Autowired
    private EntityCodeAndNamesRepository entityCodeAndNamesRepository;
    @Autowired
    private RestHighLevelClient client;
    private static AtomicLong totalTime = new AtomicLong(0L);
    private static AtomicLong totalSearches = new AtomicLong(0L);

    @Override
    public SearchResponse search(SearchRequest searchRequest) {
        long startTime = System.currentTimeMillis();
        List<SearchRecordResults> searchRecordResultsList = new ArrayList<>();
        for (SearchRecord searchRecord : searchRequest.getSearchRecordList()) {
            int fuzziness = (int) searchRequest.getSearchPreferencesMap().get("fuzziness");
            int exactSearchBoost = (int) searchRequest.getSearchPreferencesMap().get("exactSearchBoost");
            int phoneticBoost = (int) searchRequest.getSearchPreferencesMap().get("phoneticBoost");
            String matchType = (String) searchRequest.getSearchPreferencesMap().get("matchType");
            SearchHits<EntityCodeAndNames> searchHits
                    = entityCodeAndNamesRepository.findName(searchRecord.getFullName(),
                    fuzziness, exactSearchBoost, phoneticBoost, matchType);
            List<SearchRecordResults> tmpSearchRecordResults = fromSearchResults(searchHits, searchRequest.getSearchPreferencesMap());
            searchRecordResultsList.addAll(tmpSearchRecordResults);
        }
        long endTime = System.currentTimeMillis();
        totalTime.addAndGet(endTime - startTime);
        totalSearches.incrementAndGet();
        return SearchResponse.builder().searchRecordResultList(searchRecordResultsList).build();
    }

    private List<SearchRecordResults> fromSearchResults(SearchHits<EntityCodeAndNames> searchHits, Map<String,Object> searchPreferenceMap) {
        Integer numResults = (Integer) searchPreferenceMap.get("numResults");
        List<SearchHit<EntityCodeAndNames>> newSearchHits = new ArrayList<>(searchHits.getSearchHits());
        Collections.sort(newSearchHits, Comparator.comparing((SearchHit sh) -> sh.getScore()).reversed());
        List<SearchRecordResults> searchRecordResultsList = new ArrayList<>();
        List<Result> resultList = new ArrayList<>();
        for (SearchHit<EntityCodeAndNames> searchHit : searchHits.getSearchHits()) {
            EntityCodeAndNames entityCodeAndNames = searchHit.getContent();
            Result result = new Result();
            result.setEntityCodeInSource(entityCodeAndNames.getEntityCode());
            result.setTextSimilarity((double) searchHit.getScore());
            resultList.add(result);
        }
        if (resultList.size() >= numResults + 1) {
            resultList = resultList.subList(0, numResults);
        }
        searchRecordResultsList.add(SearchRecordResults.builder().results(resultList).build());
        return searchRecordResultsList;
    }

    public void index(List<EntityCodeAndNames> entityCodeAndNamesList) {
        createIndexIfNotPresent("namesearch",
                "elastic_search_settings.txt", "elastic_search_mappings.txt");
        entityCodeAndNamesRepository.saveAll(entityCodeAndNamesList);
        logger.info("Saved nameAndEntityCodeList.size() into elastic search: " + entityCodeAndNamesList.size());
    }

    public void createIndexIfNotPresent(String indexName, String settingsFileName, String mappingFileName) {
        try {
            GetIndexRequest request = new GetIndexRequest(indexName);
            if (!client.indices().exists(request, RequestOptions.DEFAULT)) {
                dropIndex(indexName);
                createIndex(indexName, settingsFileName, mappingFileName);
            }
        } catch (IOException e) {
            logger.error("Can't create index {}", indexName, e);
        }
    }

    private void dropIndex(String indexName) throws IOException {
        try {
            DeleteIndexRequest request = new DeleteIndexRequest(indexName);
            client.indices().delete(request, RequestOptions.DEFAULT);
        } catch (Exception exception) {
            exception.printStackTrace();
        }
    }

    private void createIndex(String indexName, String settingsFileName, String mappingFileName) throws IOException {
        String settings = IOUtils.toString(ResourceUtils.getResourceInputStream(settingsFileName), Charset.defaultCharset());
        String mappings = IOUtils.toString(ResourceUtils.getResourceInputStream(mappingFileName), Charset.defaultCharset());
        CreateIndexRequest indexRequest = new CreateIndexRequest(indexName);
        indexRequest.settings(settings, XContentType.JSON);
        indexRequest.mapping(mappings, XContentType.JSON);
        CreateIndexResponse createIndexResponse = client.indices().create(indexRequest, RequestOptions.DEFAULT);
        if (!createIndexResponse.isAcknowledged()) {
            logger.error("Can't create index {}", indexName);
        }
    }
}
