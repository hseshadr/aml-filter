package org.gainratio.amlfilter.parser.ofac.dto;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

@Data
public class SdnList {
    private PublishInformation publishInformation = new PublishInformation();
    private List<SdnEntry> sdnEntryList = new ArrayList<>();
}

