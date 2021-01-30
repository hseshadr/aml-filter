package org.gainratio.amlfilter.metrics;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = false)
public class FunctionalCasePrecisionRandomNames extends FunctionalCase {
    private String description = "Random names case. Based on arbitrary combination of name tokens from global dictionary.";

    public FunctionalCasePrecisionRandomNames() {
        super();
        randomNames = true;
        MIN_RECALL = 1;
        MIN_PRECISION = 0.995;
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
