package org.gainratio.amlfilter.model;

import lombok.Data;

import java.util.List;

@Data
public class SearchRecordResults {
    private SearchRecord searchRecord;
    private List<Result> results;
    private long resultsChecksum;
}
