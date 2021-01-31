package org.gainratio.amlfilter.metrics;

import lombok.Data;
import lombok.EqualsAndHashCode;
import org.gainratio.amlfilter.metrics.utils.TypoGenerator;
import org.gainratio.amlfilter.model.EntityCodeAndNames;

import java.util.List;

@Data
@EqualsAndHashCode(callSuper = false)
public class FunctionalCaseDeleteChar extends FunctionalCase {

    private String description = "Deleting one character";

    public FunctionalCaseDeleteChar(List<EntityCodeAndNames> entitiesToSearch) {
        super(entitiesToSearch);
    }

    @Override
    public String modifyString(String cleanedName) {
        return TypoGenerator.deleteChars(cleanedName, 1);
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
        boolean useThisName = name.length() > 5;
        if (!useThisName) ignoredNameCases.add(name);
        return useThisName;
    }
}
