package org.gainratio.amlfilter.metrics;

import lombok.Data;
import lombok.EqualsAndHashCode;
import org.gainratio.amlfilter.model.EntityCodeAndNames;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;
import java.util.Random;

@Data
@EqualsAndHashCode(callSuper = false)
public class FunctionalCasePrecisionRandomStrings extends FunctionalCase {
    private static final Logger logger = LoggerFactory.getLogger(FunctionalCasePrecisionRandomStrings.class);

    private String description = "Random strings case";

    public FunctionalCasePrecisionRandomStrings(List<EntityCodeAndNames> entitiesToSearch) {
        super(entitiesToSearch);
        randomNames = true;
        MIN_RECALL = 1;
        MIN_PRECISION = 0.999;
    }

    @Override
    public String modifyString(String cleanedName) {
        return replaceLettersWithRandomLetters(cleanedName);
    }

    private String replaceLettersWithRandomLetters(String cleanedName) {
        final Random rnd = new Random(System.currentTimeMillis());
        final String LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZAAAAIIIOOUEEEEEEE";
        String retString = "";
        for (int pos = 0; pos < cleanedName.length(); pos++) {
            String chr = cleanedName.substring(pos, pos + 1);
            if (LETTERS.contains(chr)) {
                int rndPos = Math.abs(rnd.nextInt() % LETTERS.length());
                retString += LETTERS.substring(rndPos, rndPos + 1);
            } else {
                retString += chr;
            }
        }
//        logger.info("## retString: "+retString);
        return retString;
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
