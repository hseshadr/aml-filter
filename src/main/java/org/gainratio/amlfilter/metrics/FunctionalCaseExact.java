package org.gainratio.amlfilter.metrics;

import lombok.Data;
import lombok.EqualsAndHashCode;
import org.gainratio.amlfilter.model.EntityCodeAndNames;

import java.util.List;

@Data
@EqualsAndHashCode(callSuper = false)
public class FunctionalCaseExact extends FunctionalCase {
    private String description = "Exact name case";

    public FunctionalCaseExact(List<EntityCodeAndNames> entitiesToSearch) {
        super(entitiesToSearch);
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
