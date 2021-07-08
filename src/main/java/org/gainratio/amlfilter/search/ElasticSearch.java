package org.gainratio.amlfilter.search;

import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.extern.slf4j.Slf4j;
import org.gainratio.amlfilter.model.SearchRequest;
import org.gainratio.amlfilter.model.SearchResponse;
import org.gainratio.amlfilter.service.EntityService;
import org.gainratio.amlfilter.service.ResultsService;
import org.gainratio.amlfilter.service.SynonymService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * Implements the name search interface in a manner that
 * performs a vector space search.
 */
@Component
@Data
@EqualsAndHashCode(callSuper = false)
@Slf4j
public class ElasticSearch  {
    private static final Logger logger = LoggerFactory.getLogger(ElasticSearch.class);
    @Autowired
    private ResultsService resultsService;
    @Autowired
    private SynonymService synonymService;
    @Autowired
    private ElasticSearchHelper elasticSearchHelper;
    @Autowired
    private EntityService entityService;

    private boolean enabled = true;

    public SearchResponse executeQuery(SearchRequest searchRequest) {
        long startTime = System.nanoTime();
        try {
            SearchResponse searchResponse = getElasticSearchHelper().search(searchRequest);
            return searchResponse;
        } catch (Exception e) {
            log.error("ERROR: ", e);
        } finally {
            if (Math.abs(startTime % 500) == 16) {
                long endTime = System.nanoTime();
                logger.info("Search time(ms): {}", (double) (endTime - startTime) / 1000000d);
            }
        }
        return null;
    }

}
