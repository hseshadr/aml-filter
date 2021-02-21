package org.gainratio.amlfilter.parser.ofac.dto;

import lombok.Data;

@Data
public class PublishInformation {
    private String publishDate;
    private int recordCount;
}
