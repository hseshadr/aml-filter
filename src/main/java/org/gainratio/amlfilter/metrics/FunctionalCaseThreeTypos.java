package org.gainratio.amlfilter.metrics;

import lombok.Data;
import org.gainratio.amlfilter.metrics.utils.TypoGenerator;

@Data
public class FunctionalCaseThreeTypos extends FunctionalCase {
    private String description = "Injecting THREE typos";
    private final double MIN_RECALL = 0.8;
    private final double MIN_PRECISION = 0.7;

    public FunctionalCaseThreeTypos() {
        super();
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
    public boolean isNameAUsableCase(String name) {
        return name.length() > 18;
    }
}
