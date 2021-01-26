package org.gainratio.amlfilter.metrics;

import lombok.Data;
import lombok.EqualsAndHashCode;
import org.gainratio.amlfilter.metrics.utils.TypoGenerator;

@Data
@EqualsAndHashCode(callSuper = false)
public class FunctionalCaseThreeTypos extends FunctionalCase {
    private String description = "Injecting THREE typos";

    public FunctionalCaseThreeTypos() {
        super();
        MIN_RECALL = 0.95;
        MIN_PRECISION = 0.7;
    }

    @Override
    public String modifyString(String cleanedName) {
        return TypoGenerator.injectTypos(cleanedName, 3);
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
        return name.length() > 18;
    }
}
