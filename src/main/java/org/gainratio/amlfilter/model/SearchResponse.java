package org.gainratio.amlfilter.model;

import lombok.Builder;
import lombok.Data;

import java.util.List;

@Data
@Builder
public class SearchResponse {
    private List<SearchRecordResults> searchRecordResultList;
    private Long totalTime;
}
