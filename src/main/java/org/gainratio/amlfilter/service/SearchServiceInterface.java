package org.gainratio.amlfilter.service;

import org.gainratio.amlfilter.model.SearchRequest;
import org.gainratio.amlfilter.model.SearchResponse;

public interface SearchServiceInterface {
    SearchResponse search(SearchRequest searchRequest) throws Exception;
}
