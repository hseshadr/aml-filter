package org.gainratio.amlfilter.metrics;

import lombok.Data;
import org.gainratio.amlfilter.metrics.utils.TypoGenerator;

@Data
public class FunctionalCaseTwoTypos extends FunctionalCase {
    private String description = "Injecting TWO typos";
    private final double MIN_RECALL = 0.9;
    private final double MIN_PRECISION = 0.7;

    public FunctionalCaseTwoTypos() {
        super();
    }

    @Override
    public String modifyString(String cleanedName) {
        return TypoGenerator.injectTypos(cleanedName, 2);
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
        return name.length() > 14;
    }
}
