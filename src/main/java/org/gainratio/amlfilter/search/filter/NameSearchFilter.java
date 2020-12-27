package org.gainratio.amlfilter.search.filter;

import org.gainratio.amlfilter.model.Result;

import java.util.List;
import java.util.Map;

public interface NameSearchFilter {
    void filterSearchResults(List<Result> pSearchResults, Map pParametersMap) throws Exception;
}