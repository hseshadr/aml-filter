package org.gainratio.amlfilter.metrics;

import lombok.Data;
import lombok.EqualsAndHashCode;
import org.gainratio.amlfilter.metrics.utils.PhoneticVariation;

@Data
@EqualsAndHashCode(callSuper=false)
public class FunctionalCasePhonetic extends FunctionalCase {
    private final double MIN_RECALL = 0.95;
    private final double MIN_PRECISION = 0.7;
    private String description = "Creating a phonetic variation";

    public FunctionalCasePhonetic() {
        super();
    }

    @Override
    public String modifyString(String cleanedName) {
        return PhoneticVariation.makeVariant(cleanedName);
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
        if (name.length() < 5) return false;
        if (!PhoneticVariation.hasAVariant(name)) return false;
        return true;
    }
}
