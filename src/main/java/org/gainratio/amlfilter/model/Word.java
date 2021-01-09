package org.gainratio.amlfilter.model;

import lombok.Data;

@Data
public class Word {
    private String id;
    private String word;
    private Integer numTimesFound;
}
