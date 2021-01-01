package org.gainratio.amlfilter.metrics;

import org.gainratio.amlfilter.metrics.utils.TypoGenerator;

public class FunctionalCaseThreeTypos extends FunctionalCase {
    private final String description = "Injecting THREE typos";

    public FunctionalCaseThreeTypos() {
        super();
    }

    @Override
    public String modifyString(String cleanedName) {
        return TypoGenerator.injectTypos(cleanedName, 3);
    }

}
