package org.gainratio.amlfilter.loader;


import org.gainratio.amlfilter.BaseUnitTest;
import org.gainratio.amlfilter.sdn.Sanctions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.net.URL;

import static org.junit.jupiter.api.Assertions.assertTrue;

public class SDNParserTest extends BaseUnitTest {
    @BeforeEach
    void init() {
        attachLogAppender();
    }

    @Test
    void testParseReturnsNonZeroEntries() throws Exception {
        String url = "https://www.treasury.gov/ofac/downloads/sanctions/1.0/sdn_advanced.xml";
        SDNParser sdnParser = new SDNParser();
        sdnParser.setUrl(url);
        Sanctions sanctions = sdnParser.parse();
        assertTrue(sanctions.getSanctionsEntries().getSanctionsEntry().size() > 0);
        verifyLogMessage("numSanctionEntries");
    }
}
