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

public class NrfParser {
    private static final Logger logger = LoggerFactory.getLogger(NrfParser.class);

    /**
     * Reads a NRF file and returns the list with the entities
     *
     * @param filename the file name
     * @param MAX_LINES the mac number of lines to load. If 0, it loads all
     * @return the list of entities
     * @throws IOException
     */
    public static List<EntityCodeAndNames> loadFromTextFile(String filename, int MAX_LINES) throws IOException {
        final String SEP = "\t--\t";
        List<EntityCodeAndNames> retList = new ArrayList<>();

        File f = new File(filename);
        InputStream is = null;
        if (!f.exists()) {
            is = ResourceUtils.getResourceInputStream(filename); // Try to get it from classpath
            if (null==is) {
                String msg = "File not found: " + filename;
                logger.error(msg);
                throw new IllegalStateException(msg);
            }
        }
        int lineCounter = 0;
        if (null==is) is=new FileInputStream(f);
        logger.info("Loading records from file: {}", filename);
        try (Scanner sc = new Scanner(is, "UTF-8")) {
            while (sc.hasNextLine() && (lineCounter++<MAX_LINES || MAX_LINES==0)) {
                String line = sc.nextLine();
                String[] fields = line.split(SEP);
                String code = fields[0];
                String name = fields[1];
                EntityCodeAndNames en = EntityCodeAndNames.buildOne(code, name);
                retList.add(en);
                if (lineCounter%100000==0) logger.info("\tProgress: {} records", lineCounter);
            }

            // note that Scanner suppresses exceptions
            if (sc.ioException() != null) {
                throw sc.ioException();
            }
        }
        logger.info("Records read: "+retList.size());
        return retList;
    }
}
