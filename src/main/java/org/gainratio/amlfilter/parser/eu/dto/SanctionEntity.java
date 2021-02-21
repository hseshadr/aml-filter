package org.gainratio.amlfilter.parser.eu.dto;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

@Data
public class SanctionEntity {
    private String id;
    private List<NameAlias> nameAliasList = new ArrayList<>();
}
