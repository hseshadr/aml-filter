package org.gainratio.amlfilter.model;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

@Data
public class SearchResponse {
    private List<SearchRecordResults> searchRecordResults = new ArrayList<SearchRecordResults>();

}
