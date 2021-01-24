package org.gainratio.amlfilter.metrics;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper=false)
public class FunctionalCaseExact extends FunctionalCase {
    private final double MIN_RECALL = 1.0;
    private final double MIN_PRECISION = 0.7;
    private String description = "Exact name case";

    public FunctionalCaseExact() {
        super();
    }

    @Override
    public String modifyString(String cleanedName) {
        return cleanedName;
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
        return true;
    }
}
