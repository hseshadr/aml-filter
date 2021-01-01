package org.gainratio.amlfilter.metrics;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

@Data
public class FunctionalCase {
    private final String description = "DO NOT USE THIS CLASS, PLEASE. YOU CAN EXTEND IT.";
    private int caseCount;
    private int truePositives;
    private int falsePositives;
    private int falseNegatives;
    private int totalResultsCount;
    private List<String> falseNegativeList = new ArrayList<>();
    private List<String> falsePositiveList = new ArrayList<>();

    public String modifyString(String cleanedName) {
        return "DO NOT USE THIS CLASS, PLEASE. YOU CAN EXTEND IT.";
    }

    public void incTestCaseCount() { caseCount++; }
    public void incTruePositives() { truePositives++; }
    public void incFalsePositives() { falsePositives++; }
    public void incFalseNegatives() { falseNegatives++; }
    public void incTotalResultsCount() { totalResultsCount++; }
}
