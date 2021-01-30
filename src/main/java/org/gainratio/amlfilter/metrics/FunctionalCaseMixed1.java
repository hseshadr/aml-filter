package org.gainratio.amlfilter.metrics;

import lombok.Data;
import lombok.EqualsAndHashCode;
import org.gainratio.amlfilter.metrics.utils.PhoneticVariation;
import org.gainratio.amlfilter.metrics.utils.TypoGenerator;

@Data
@EqualsAndHashCode(callSuper = false)
public class FunctionalCaseMixed1 extends FunctionalCase {
    private String description = "Injecting several alterations";

    public FunctionalCaseMixed1() {
        super();
        MIN_RECALL = 0.8;
        MIN_PRECISION = 0.7;
    }

    @Override
    public String modifyString(String cleanedName) {
        String modString = cleanedName;
        modString = TypoGenerator.deleteChars(modString, 1);
        modString = TypoGenerator.injectTypos(modString, 1);
        modString = TypoGenerator.doubleChars(modString, 1);
        modString = PhoneticVariation.makeVariant(modString);
        return modString;
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
        boolean useThisName = name.length() > 12;
        if (!useThisName) ignoredNameCases.add(name);
        return useThisName;
    }
}
