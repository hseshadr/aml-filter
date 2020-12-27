
package org.gainratio.amlfilter.service;

import org.gainratio.amlfilter.model.Result;

import java.util.List;
import java.util.Map;


public interface ResultsServiceInterface {
    List<Result> removeResultRepetitionsByNameAndSimilarity(List<Result> pResults);
    List<Result> removeResultRepetitionsByEntityCodeAndSimilarity(List<Result> pResults);
    List<Result> removeResultSynonyms(List<Result> pResults);
}