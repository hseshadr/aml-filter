package org.gainratio.amlfilter.service;

import org.gainratio.amlfilter.BaseUnitTest;
import org.gainratio.amlfilter.model.Result;
import org.gainratio.amlfilter.model.SearchRecord;
import org.gainratio.amlfilter.model.SearchRequest;
import org.gainratio.amlfilter.model.SearchResponse;
import org.junit.jupiter.api.Test;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
class SearchServiceTest extends BaseUnitTest {
    private static final Logger logger = LoggerFactory.getLogger(SearchServiceTest.class);
    @Autowired
    SearchService searchService;
    @Autowired
    EntityService entityService;

    static int entitiesCount = 0;

    @Test
    void search() throws Exception {

        entityService.getEntityMap().values().stream().forEach(e -> {
            entitiesCount++;
            e.getEntityNameSet().stream().forEach(name -> {
                SearchRequest searchRequest = SearchRequest
                        .builder()
                        .searchRecordList(List.of(SearchRecord.builder().fullName(name).build())).build();
                SearchResponse searchResponse = searchService.search(searchRequest);
                logger.info("searchResponse={}", searchResponse);

                if (searchResponse.getSearchRecordResultList().get(0).getResults().size() == 0) {
                    logger.error("name={}, entitiesCount={}, totalNumEntitites={}", name, entitiesCount, entityService.getEntityMap().size());
                }
                List<Result> resultList = searchResponse.getSearchRecordResultList().get(0).getResults();
                if (resultList.size() > 0) {
                    Float sim = resultList.get(0).getTextSimilarity();
                    if (sim != 1.0) {
                        logger.error("name={}, sim={}, entitiesCount={}, totalNumEntitites={}", name, sim, entitiesCount, entityService.getEntityMap().size());
                    }
                    assertTrue(sim == 1.0);
                }
            });
        });
    }

    @Test
    void searchOneName() {
        String name = "فندق الجلاء";
        SearchRequest searchRequest = SearchRequest
                .builder()
                .searchRecordList(List.of(SearchRecord.builder().fullName(name).build())).build();
        SearchResponse searchResponse = searchService.search(searchRequest);
        logger.info("searchResponse={}", searchResponse);
        List<Result> resultList = searchResponse.getSearchRecordResultList().get(0).getResults();
        assertTrue(resultList.size() == 0);
    }
}