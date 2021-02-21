package org.gainratio.amlfilter.parser.ofac.dto;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

@Data
public class AkaList {
    private List<Aka> akaList = new ArrayList<>();
}
