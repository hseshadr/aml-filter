package org.gainratio.amlfilter.vector.filter;

import org.gainratio.amlfilter.model.Result;

import java.util.List;

public interface NameSearchFilter {
    List<Result> filterSearchResults(List<Result> pSearchResults);
}