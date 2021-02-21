package org.gainratio.amlfilter.parser.ofac.dto;

import lombok.Data;

@Data
public class SdnEntry {
    private String uid;
    private String lastName;
    private AkaList akaList = new AkaList();
}
