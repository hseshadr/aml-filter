package org.gainratio.amlfilter.metrics;

import lombok.Data;
import lombok.EqualsAndHashCode;
import org.gainratio.amlfilter.metrics.utils.TypoGenerator;

@Data
@EqualsAndHashCode(callSuper = false)
public class FunctionalCaseOneTypo extends FunctionalCase {
    private final double MIN_RECALL = 0.95;
    private final double MIN_PRECISION = 0.7;
    private String description = "Injecting ONE typo";

    public FunctionalCaseOneTypo() {
        super();
    }

    @Override
    public String modifyString(String cleanedName) {
        return TypoGenerator.injectTypos(cleanedName, 1);
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
        boolean useThisName = name.length() > 10;
        if (!useThisName) ignoredNameCases.add(name);
        return useThisName;
    }
}
