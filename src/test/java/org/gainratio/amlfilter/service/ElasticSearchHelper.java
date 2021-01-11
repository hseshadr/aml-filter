package org.gainratio.amlfilter.service;
import org.apache.commons.io.IOUtils;
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
import java.util.ArrayList;
import java.util.List;
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
            SearchHits<EntityCodeAndNames> searchHits
                    = entityCodeAndNamesRepository.findName(searchRecord.getFullName(),
                    (int)searchRequest.getSearchPreferencesMap().get("fuzziness"));
            List<SearchRecordResults> tmpSearchRecordResults = fromSearchResults(searchHits);
            searchRecordResultsList.addAll(tmpSearchRecordResults);
        }
        long endTime = System.currentTimeMillis();
        totalTime.addAndGet(endTime - startTime);
        totalSearches.incrementAndGet();
        return SearchResponse.builder().searchRecordResultList(searchRecordResultsList).build();
    }

    private List<SearchRecordResults> fromSearchResults(SearchHits<EntityCodeAndNames> searchHits) {
        List<SearchRecordResults> searchRecordResultsList = new ArrayList<>();
        List<Result> resultList = new ArrayList<>();
        for (SearchHit<EntityCodeAndNames> searchHit : searchHits.getSearchHits()) {
            EntityCodeAndNames entityCodeAndNames = searchHit.getContent();
            Result result = new Result();
            result.setEntityCodeInSource(entityCodeAndNames.getEntityCode());
            result.setTextSimilarity(searchHit.getScore());
            resultList.add(result);
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
                createIndex(indexName, settingsFileName, mappingFileName);
            }
        } catch (IOException e) {
            logger.error("Can't create index {}", indexName, e);
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
