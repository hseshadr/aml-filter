package org.gainratio.amlfilter.metrics;

import lombok.Data;
import lombok.EqualsAndHashCode;
import org.gainratio.amlfilter.metrics.utils.TypoGenerator;

@Data
@EqualsAndHashCode(callSuper = false)
public class FunctionalCaseDoublingChars extends FunctionalCase {
    private String description = "Doubling one char in the name";

    public FunctionalCaseDoublingChars() {
        super();
        MIN_RECALL = 0.98;
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
