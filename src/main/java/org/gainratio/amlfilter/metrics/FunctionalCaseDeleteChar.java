package org.gainratio.amlfilter.metrics;

import lombok.Data;
import lombok.EqualsAndHashCode;
import org.gainratio.amlfilter.metrics.utils.TypoGenerator;

@Data
@EqualsAndHashCode(callSuper = false)
public class FunctionalCaseDeleteChar extends FunctionalCase {
    private final double MIN_RECALL = 0.95;
    private final double MIN_PRECISION = 0.7;
    private String description = "Deleting one character";

    public FunctionalCaseDeleteChar() {
        super();
    }

    @Override
    public String modifyString(String cleanedName) {
        return TypoGenerator.deleteChars(cleanedName, 1);
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
        boolean useThisName = name.length() > 5;
        if (!useThisName) ignoredNameCases.add(name);
        return useThisName;
    }
}
