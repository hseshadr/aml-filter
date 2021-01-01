package org.gainratio.amlfilter.metrics;

import org.gainratio.amlfilter.metrics.utils.TypoGenerator;

public class FunctionalCaseTwoTypos extends FunctionalCase {
    private final String description = "Injecting TWO typos";

    public FunctionalCaseTwoTypos() {
        super();
    }

    @Override
    public String modifyString(String cleanedName) {
        return TypoGenerator.injectTypos(cleanedName, 2);
    }

}
