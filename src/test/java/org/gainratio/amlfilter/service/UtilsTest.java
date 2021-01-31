package org.gainratio.amlfilter.service;

import org.gainratio.amlfilter.model.EntityCodeAndNames;
import org.junit.jupiter.api.Test;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class UtilsTest {
    private static final Logger logger = LoggerFactory.getLogger(UtilsTest.class);

    @Test
    void load_wc_small_file() throws IOException {
        List<EntityCodeAndNames> entities = Utils.load_wc("wctest10.txt");
        int counter = 0;
        for (EntityCodeAndNames ent : entities) {
            logger.info("# Entity: "+ent);
            assertTrue(ent.getEntityCode().length()>1);
            Integer codeInt = Integer.parseInt(ent.getEntityCode());
            assertTrue(codeInt>0);
            assertTrue(ent.getNameSet().size()>0);
            String[] names = ent.getNameSet().toArray(new String[0]);
            assertTrue(names[0].length()>1);
            if (counter++>25) break;
        }
        assertEquals(10, counter);
    }

        @Test
    void load_wc_big_file() throws IOException {
        List<EntityCodeAndNames> entities = Utils.load_wc(
                "/Users/marco/tul_pers/aml-filter/data/world-check1.5mlnTest.txt");
        int counter = 0;
        for (EntityCodeAndNames ent : entities) {
            //logger.info("# Entity: "+ent);
            assertTrue(ent.getEntityCode().length()>1);
            Integer codeInt = Integer.parseInt(ent.getEntityCode());
            assertTrue(codeInt>0);
            assertTrue(ent.getNameSet().size()>0);
            String[] names = ent.getNameSet().toArray(new String[0]);
            assertTrue(names[0].length()>1);
            //if (counter++>25) break;
        }
        logger.info("counter: "+counter);
    }


}