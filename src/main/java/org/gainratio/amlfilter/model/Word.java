package org.gainratio.amlfilter.model;

import lombok.Data;

@Data
public class Word {
    private Long id;
    private String word;
    private Integer numTimesFound;
}
