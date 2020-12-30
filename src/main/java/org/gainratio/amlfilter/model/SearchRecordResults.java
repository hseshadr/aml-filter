package org.gainratio.amlfilter.model;

import lombok.Builder;
import lombok.Data;

import java.util.List;

@Data
@Builder
public class SearchRecordResults {
    private SearchRecord searchRecord;
    private List<Result> results;
}
