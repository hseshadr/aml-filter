package org.gainratio.amlfilter.service;

import lombok.AllArgsConstructor;
import lombok.Data;
import org.gainratio.amlfilter.model.Result;

@Data
@AllArgsConstructor
public class ResultMatch {
    private Result result;
    private Double textSimilarity;
    private boolean match;
}
