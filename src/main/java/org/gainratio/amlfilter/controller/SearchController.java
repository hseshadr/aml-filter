package org.gainratio.amlfilter.controller;

import io.micrometer.core.annotation.Timed;
import org.gainratio.amlfilter.model.SearchRequest;
import org.gainratio.amlfilter.model.SearchResponse;
import org.gainratio.amlfilter.service.SearchService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.time.Instant;

@RestController
@RequestMapping("search")
public class SearchController {
    private final SearchService searchService;

    @Autowired
    public SearchController(SearchService searchService) {
        this.searchService = searchService;
    }

    @PostMapping
    @Timed
    SearchResponse search(@RequestBody SearchRequest searchRequest) {
        Instant start = Instant.now();
        SearchResponse searchResponse = null;
        try {
            searchResponse = searchService.search(searchRequest);
        } finally {
            Instant finish = Instant.now();
            long timeElapsed = Duration.between(start, finish).toMillis();
            searchResponse.setTotalTime(timeElapsed);
        }
        return searchResponse;
    }
}
