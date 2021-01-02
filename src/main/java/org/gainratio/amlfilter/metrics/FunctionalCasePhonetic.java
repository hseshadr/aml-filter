package org.gainratio.amlfilter.metrics;

import lombok.Data;
import org.gainratio.amlfilter.metrics.utils.PhoneticVariation;
import org.gainratio.amlfilter.metrics.utils.TypoGenerator;

@Data
public class FunctionalCasePhonetic extends FunctionalCase {
    private String description = "Creating a phonetic variation";
    private final double MIN_RECALL = 0.95;
    private final double MIN_PRECISION = 0.7;

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
    public boolean isNameAUsableCase(String name) {
        if (name.length() < 5) return false;
        if (!PhoneticVariation.hasAVariant(name)) return false;
        return true;
    }
}
