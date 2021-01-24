package org.gainratio.amlfilter.model;

import lombok.Builder;
import lombok.Data;

import java.util.List;
import java.util.Map;

@Data
@Builder
public class SearchRequest {
    private Map<String, Object> searchPreferencesMap;
    private String searchDate;
    private List<SearchRecord> searchRecordList;
}
