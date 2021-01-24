package org.gainratio.amlfilter.metrics.utils;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.*;

public class PhoneticVariation {
    private static final Logger logger = LoggerFactory.getLogger(PhoneticVariation.class);

    static Random rnd = new Random();

    static List<List<String>> validValuesList = new ArrayList<>();

    static {
        // IMPORTANT: Make sure the first element in each list is the longest one.
        validValuesList.add(Arrays.asList(new String[]{"V", "B"}));
        validValuesList.add(Arrays.asList(new String[]{"G", "J"}));
        validValuesList.add(Arrays.asList(new String[]{"C", "K"}));
        validValuesList.add(Arrays.asList(new String[]{"NP", "MP"}));
        validValuesList.add(Arrays.asList(new String[]{"CH", "TX"}));
        validValuesList.add(Arrays.asList(new String[]{"LL", "Y"}));
        validValuesList.add(Arrays.asList(new String[]{"Z", "S"}));
        validValuesList.add(Arrays.asList(new String[]{"EL", "AL", "IL"}));
    }

    public static boolean hasAVariant(String name) {
        String modName = makeVariant(name);
        if (name.equals(modName)) return false;
        return true;
    }

    public static String makeVariant(String name) {
        List<List<String>> valuesList = new ArrayList<>();
        valuesList.addAll(validValuesList);
        Collections.shuffle(valuesList);
        Collections.sort(valuesList, (a, b) -> b.get(0).length() - a.get(0).length());
        boolean stop = false;
        String modName = name;
        for (List<String> list : valuesList) {
            if (stop) break;
            for (int i = 0; i < list.size(); i++) {
                String value = list.get(i);
                if (name.contains(value)) {
                    stop = true;
                    String replacement = retrieveOneOfTheListPosibilities(list, value);
                    int posInName = retrieveOneOfThePositionsInTheString(name, value);
                    modName = modName.substring(0, posInName) +
                            replacement +
                            modName.substring(posInName + value.length());
                    // ...
                }
                if (stop) break;
            }
        }
        return modName;
    }

    /**
     * Gets one of the strings, avoiding to grab the given one
     *
     * @param listWithOptions the list of strings to choose from
     * @param value           the value to avoid
     * @return one random element from the list
     */
    public static String retrieveOneOfTheListPosibilities(List<String> listWithOptions, String value) {
        int itemPos = (int) (rnd.nextDouble() * listWithOptions.size());
        int protectionCount = 0;
        while (value.equals(listWithOptions.get(itemPos))) {
            itemPos = (int) (rnd.nextDouble() * listWithOptions.size());
            if (protectionCount++ > 100)
                throw new IllegalStateException("Error grabbing a phonetic variation from listWithOptions: " + listWithOptions);
        }
        return listWithOptions.get(itemPos);
    }

    private static int retrieveOneOfThePositionsInTheString(String name, String value) {
        // TODO: return ONE of the existing instances within the string, not just the first one.
        return name.indexOf(value);
    }
}
