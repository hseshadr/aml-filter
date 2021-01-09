package org.gainratio.amlfilter.metrics;

import lombok.Data;
import org.gainratio.amlfilter.metrics.utils.TypoGenerator;

@Data
public class FunctionalCaseDoublingChars extends FunctionalCase {
    private String description = "Doubling one char in the name";
    private final double MIN_RECALL = 0.95;
    private final double MIN_PRECISION = 0.7;

    public FunctionalCaseDoublingChars() {
        super();
    }

    @Override
    public String modifyString(String cleanedName) {
        return TypoGenerator.doubleChars(cleanedName, 1);
    }

    @Override
    public boolean passesEvaluation() {
        return super.passesEvaluation(MIN_RECALL, MIN_PRECISION);
    }

    @Override
    public double getExpectedRecall() {
        return MIN_RECALL;
    }

    @Override
    public double getExpectedPrecision() {
        return MIN_PRECISION;
    }

    @Override
    public boolean isNameAUsableCase(String name) {
        boolean useThisName = name.length() > 8;
        if (!useThisName) ignoredNameCases.add(name);
        return useThisName;
    }
}
