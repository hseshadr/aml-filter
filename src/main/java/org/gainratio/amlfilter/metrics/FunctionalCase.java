package org.gainratio.amlfilter.metrics;

import lombok.Data;
import org.gainratio.amlfilter.model.EntityCodeAndNames;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.List;

@Data
public abstract class FunctionalCase {
    public double MIN_RECALL = 1.0;
    protected double MIN_PRECISION = 0.6;
    protected boolean randomNames = false;

    private static final Logger logger = LoggerFactory.getLogger(FunctionalCase.class);
    protected List<String> falseNegativeList = new ArrayList<>();
    protected List<String> falsePositiveList = new ArrayList<>();
    protected List<String> ignoredNameCases = new ArrayList<>();
    protected List<EntityCodeAndNames> entitiesToSearch;
    private int caseCount;
    private int truePositives;
    private int falsePositives;
    private int falseNegatives;
    private int totalResultsCount;
    private int averageNumResultsPerSearch;

    public FunctionalCase() {}

    public FunctionalCase(List<EntityCodeAndNames> entitiesToSearch) {
        this.entitiesToSearch = entitiesToSearch;
    }

    public boolean areNamesRandom() {
        return randomNames;
    }

    public int getTruePositives() {
        if (randomNames) return caseCount; // if random names, we assume the exact search would work. Avoids NaN
        return truePositives;
    }

    public void incTestCaseCount() {
        caseCount++;
    }

    public void incTruePositives() {
        truePositives++;
    }

    public void incFalsePositives() {
        falsePositives++;
    }

    public void incFalseNegatives() {
        falseNegatives++;
    }

    public void incTotalResultsCount(int delta) {
        totalResultsCount += delta;
    }

    public abstract String getDescription();

    public abstract boolean isNameAUsableCase(String name);

    public abstract String modifyString(String cleanedName);

    public abstract boolean passesEvaluation();

    public abstract double getExpectedRecall();

    public abstract double getExpectedPrecision();

    public boolean passesEvaluation(double MIN_RECALL, double MIN_PRECISION) {
        double recall = (double) getTruePositives() / (double) getCaseCount();
        double precision = (double) getTruePositives() / ((double) getTruePositives() + (double) getFalsePositives());
        if (recall >= MIN_RECALL && precision > MIN_PRECISION) return true;
        return false;
    }

    public String retrieveEvaluationResult() {
        double recall = (double) getTruePositives() / (double) getCaseCount();
        double precision = (double) getTruePositives() / ((double) getTruePositives() + (double) getFalsePositives());
        calculateAverageNumberOfResults();
        String extraInfo = "";
        if (areNamesRandom()) {
            extraInfo += "\nfalsePositiveList: ";
            extraInfo += falsePositiveList;
        }
        return "## caseCount=" + getCaseCount()
                + ", recall=" + recall + ", precision=" + precision
                + ", expectedRecall=" + getExpectedRecall() + ", expectedPrecision=" + getExpectedPrecision()
                + ", averageNumResultsPerSearch=" + averageNumResultsPerSearch
                + ", passed=" + passesEvaluation()
                + extraInfo;
    }

    private void calculateAverageNumberOfResults() {
        averageNumResultsPerSearch = (int) Math.ceil((double) totalResultsCount / (double) caseCount);
    }

    /**
     * Gets the FN and FP
     *
     * @param maxNumberOfItems the max number of FN or FP to retrieve. If 0, it gets all of them.
     * @return the string to directly log it.
     */
    public String retrieveTestLogs(int maxNumberOfItems) {
        String falseNegatives = "";
        int itemCount = 0;
        List<String> falseNegativeList = getFalseNegativeList();
        for (String fn : falseNegativeList) {
            falseNegatives += "\n\t" + fn;
            if (maxNumberOfItems > 0 && itemCount++ >= maxNumberOfItems) {
                falseNegatives += "\n\t... (reached max number of items: "
                        + maxNumberOfItems + " out of "+falseNegativeList.size()+")";
                break;
            }
        }
        falseNegatives = "falseNegatives: " + falseNegatives;

        String falsePositives = "";
        itemCount = 0;
        for (String fp : getFalsePositiveList()) {
            falsePositives += "\n\t" + fp;
            if (maxNumberOfItems > 0 && itemCount++ >= maxNumberOfItems) {
                falsePositives += "\n\t... (reached max number of items: " + maxNumberOfItems + ")";
                break;
            }
        }
        falsePositives = "falsePositives: " + falsePositives;
        String averageNumberOfResults = "averageNumberOfResults: " + totalResultsCount / caseCount;

        return retrieveEvaluationResult() + "\n" + falseNegatives + "\n"
                + falsePositives + "\n" + averageNumberOfResults;
    }
}
