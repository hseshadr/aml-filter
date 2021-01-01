package org.gainratio.amlfilter.metrics;

import org.gainratio.amlfilter.metrics.utils.TypoGenerator;

public class FunctionalCaseOneTypo extends FunctionalCase {
    private final String description = "Injecting ONE typo";

    public FunctionalCaseOneTypo() {
        super();
    }

    @Override
    public String modifyString(String cleanedName) {
        return TypoGenerator.injectTypos(cleanedName, 1);
    }

}
