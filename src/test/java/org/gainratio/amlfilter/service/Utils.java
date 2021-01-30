package org.gainratio.amlfilter.service;

import org.gainratio.amlfilter.model.EntityCodeAndNames;
import org.gainratio.amlfilter.util.ResourceUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;

public class Utils {
    private static final Logger logger = LoggerFactory.getLogger(Utils.class);
    private static Random rnd = new Random(System.currentTimeMillis());

    public static List<EntityCodeAndNames> prepareRandomNames(int numNamesToPrepare) throws IOException {
        List<String> firstNames = ResourceUtils.loadLines("firstnames.txt");
        List<String> lastNames = ResourceUtils.loadLines("lastnames.txt");

        List<EntityCodeAndNames> names = new ArrayList<>();
        for (int i=0; i<numNamesToPrepare; i++) {
            EntityCodeAndNames newName = makeRandomName(firstNames, lastNames);
            names.add(newName);
        }

        return names;
    }

    public static String retriveRandomString(List<String> stringList) {
        int numItems = stringList.size();
        int rndPos = Math.abs(rnd.nextInt()%numItems);
        return stringList.get(rndPos);
    }

    public static EntityCodeAndNames makeRandomName(List<String> firstNames, List<String> lastNames) {
        final String SPACE = " ";
        final String COMMA = ",";
        final int NUM_CASES = 3;
        int nameCase = Math.abs(rnd.nextInt()%NUM_CASES);
//        logger.info("nameCase: "+nameCase);

        String randomName;
        switch (nameCase) {
            case 0: randomName =
                    retriveRandomString(firstNames)+
                            SPACE+
                            retriveRandomString(lastNames);
                break;
            case 1: randomName =
                    retriveRandomString(firstNames)+
                            SPACE+
                            retriveRandomString(lastNames)+
                            SPACE+
                            retriveRandomString(lastNames);
                break;
            case 2: randomName =
                    retriveRandomString(lastNames)+
                            COMMA+SPACE+
                            retriveRandomString(firstNames);
                break;
            default: randomName =
                    retriveRandomString(firstNames);
                break;
        }

        EntityCodeAndNames newRandomeNameAndCode = EntityCodeAndNames.buildOne(null, randomName);
        return newRandomeNameAndCode;
    }
}
