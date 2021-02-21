package org.gainratio.amlfilter.parser.general;

import org.gainratio.amlfilter.model.EntityCodeAndNames;
import org.gainratio.amlfilter.util.ResourceUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Scanner;

public class TsvParser {
    private static final Logger logger = LoggerFactory.getLogger(TsvParser.class);

    /**
     * Reads a TSV file and returns the list with the entities
     *
     * @param filename  the file name
     * @param MAX_LINES the mac number of lines to load. If 0, it loads all
     * @return the list of entities
     * @throws IOException
     */
    public static List<EntityCodeAndNames> loadFromTextFile(String filename, int MAX_LINES) throws IOException {
        final String SEP = "\t";
        final String SPACE = " ";
        final String EMPTY = "";
        List<EntityCodeAndNames> retList = new ArrayList<>();

        File f = new File(filename);
        InputStream is = null;
        if (!f.exists()) {
            is = ResourceUtils.getResourceInputStream(filename); // Try to get it from classpath
            if (null == is) {
                String msg = "File not found: " + filename;
                logger.error(msg);
                throw new IllegalStateException(msg);
            }
        }
        int lineCounter = 0;
        if (null == is) is = new FileInputStream(f);
        logger.info("Loading records from file: {}", filename);
        try (Scanner sc = new Scanner(is, "UTF-16")) {
            while (sc.hasNextLine() && (lineCounter++ < MAX_LINES || MAX_LINES == 0)) {
                String line = sc.nextLine();
                if (line.length() < 4) {
                    logger.info("** Bad record: {}", line);
                    continue;
                }
                String[] fields = line.split(SEP);
                if (fields.length < 4) {
                    logger.info("** Bad record number of fields ({}): '{}'", fields.length, line);
                    continue;
                }
                String code = null;
                String firstName = fields[0];
                String lastName1 = fields[1];
                String lastName2 = fields[2];
                if (null == firstName) firstName = EMPTY;
                if (null == lastName1) lastName1 = EMPTY;
                if (null == lastName2) lastName2 = EMPTY;
                String name = firstName + SPACE + lastName1 + SPACE + lastName2;
                name = name.trim();
                EntityCodeAndNames en = EntityCodeAndNames.buildOne(code, name);
                retList.add(en);
                if (lineCounter % 100000 == 0) logger.info("\tProgress: {} records", lineCounter);
            }

            // note that Scanner suppresses exceptions
            if (sc.ioException() != null) {
                logger.error(sc.ioException().toString());
//                throw sc.ioException();
            }
        }
        logger.info("Records read: " + retList.size());
        return retList;
    }
}
