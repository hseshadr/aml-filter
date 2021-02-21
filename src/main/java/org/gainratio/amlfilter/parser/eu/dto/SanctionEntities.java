package org.gainratio.amlfilter.parser.eu.dto;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

@Data
public class SanctionEntities {
    private List<SanctionEntity> sanctionEntityList = new ArrayList<>();
}
