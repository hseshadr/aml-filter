package org.gainratio.amlfilter.model;

import lombok.Data;

@Data
public class Result {
    private String uniqueId;
    private String searchName;
    private String resultName;
    private String entityCodeInSource;
    private String listName;
    private Double textSimilarity;
    private Double resultNameInformationLevel;
}