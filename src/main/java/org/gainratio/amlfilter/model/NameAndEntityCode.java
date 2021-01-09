package org.gainratio.amlfilter.model;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class NameAndEntityCode {
    private String name;
    private String entityCode;
}
