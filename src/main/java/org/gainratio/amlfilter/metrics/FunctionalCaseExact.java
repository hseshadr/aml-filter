package org.gainratio.amlfilter.metrics;

import lombok.Data;
import org.gainratio.amlfilter.metrics.utils.TypoGenerator;

@Data
public class FunctionalCaseExact extends FunctionalCase {
    private String description = "Exact name case";
    private final double MIN_RECALL = 1.0;
    private final double MIN_PRECISION = 0.7;

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
    public boolean isNameAUsableCase(String name) {
        return true;
    }
}
