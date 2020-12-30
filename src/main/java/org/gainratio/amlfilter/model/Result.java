package org.gainratio.amlfilter.model;

import lombok.Data;

@Data
public class Result {
    private String searchName;
    private String resultName;
    private String entityCodeInSource;
    private String listName;
    private Float textSimilarity;
    private Float resultNameInformationLevel;
    private SearchRecord searchRecord;
}