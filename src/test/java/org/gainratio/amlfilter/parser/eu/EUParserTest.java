package org.gainratio.amlfilter.parser.eu;

import org.gainratio.amlfilter.model.Entity;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
public class EUParserTest {
    @Autowired
    private EUParser euParser;

    @Test
    void test_parse() throws Exception {
        List<Entity> entityList = euParser.parse();
        assertTrue(entityList.size() > 0);
    }
}
