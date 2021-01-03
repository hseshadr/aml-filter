package org.gainratio.amlfilter.metrics;

import lombok.Data;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.List;

@Data
public class FunctionalCase {
    private static final Logger logger = LoggerFactory.getLogger(FunctionalCase.class);

    private String description = "DO NOT USE THIS CLASS, PLEASE. YOU CAN EXTEND IT.";
    private int caseCount;
    private int truePositives;
    private int falsePositives;
    private int falseNegatives;
    private int totalResultsCount;
    protected List<String> falseNegativeList = new ArrayList<>();
    protected List<String> falsePositiveList = new ArrayList<>();
    protected List<String> ignoredNameCases = new ArrayList<>();

    public String modifyString(String cleanedName) {
        return "DO NOT USE THIS CLASS, PLEASE. YOU CAN EXTEND IT.";
    }

    public void incTestCaseCount() { caseCount++; }
    public void incTruePositives() { truePositives++; }
    public void incFalsePositives() { falsePositives++; }
    public void incFalseNegatives() { falseNegatives++; }
    public void incTotalResultsCount() { totalResultsCount++; }

//    private final double MIN_RECALL = 0.9;
//    private final double MIN_PRECISION = 0.7;

    public boolean passesEvaluation() {
        return false;
    }

    public boolean passesEvaluation(double MIN_RECALL, double MIN_PRECISION) {
        double recall = (double)getTruePositives()/(double) getCaseCount();
        double precision = (double)getTruePositives()/((double)getTruePositives()+(double)getFalsePositives());
        if (recall>=MIN_RECALL && precision>MIN_PRECISION) return true;
        return false;
    }

    public String retrieveEvaluationResult() {
        double recall = (double)getTruePositives()/(double) getCaseCount();
        double precision = (double)getTruePositives()/((double)getTruePositives()+(double)getFalsePositives());
        return "## caseCount="+getCaseCount()+", recall="+recall+", precision="+precision;
    }

    /**
     * Gets the FN and FP
     * @param maxNumberOfItems the max number of FN or FP to retrieve. If 0, it gets all of them.
     * @return the string to directly log it.
     */
    public String retrieveTestLogs(int maxNumberOfItems) {
        String falseNegatives = "";
        int itemCount = 0;
        for (String fn : getFalseNegativeList()) {
            falseNegatives+="\n\t"+fn;
            if (maxNumberOfItems>0 && itemCount++>=maxNumberOfItems) {
                falseNegatives+="\n\t... (reached max number of items: "+maxNumberOfItems+")";
                break;
            }
        }
        falseNegatives="falseNegatives: "+falseNegatives;

        String falsePositives = "";
        itemCount = 0;
        for (String fp : getFalsePositiveList()) {
            falsePositives+="\n\t"+fp;
            if (maxNumberOfItems>0 && itemCount++>=maxNumberOfItems) {
                falsePositives+="\n\t... (reached max number of items: "+maxNumberOfItems+")";
                break;
            }
        }
        falsePositives="falsePositives: "+falsePositives;

        return retrieveEvaluationResult()+"\n"+falseNegatives+"\n"+falsePositives;
    }

    public boolean isNameAUsableCase(String name) {
        return false;
    }
}
