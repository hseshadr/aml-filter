package org.gainratio.amlfilter.parser;

import lombok.Data;
import org.gainratio.amlfilter.sdn.Sanctions;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;
import javax.xml.bind.JAXBContext;
import javax.xml.bind.Unmarshaller;
import java.net.URL;

@Component
@Data
public class SDNParser implements Parser<Sanctions> {
    private static final Logger logger = LoggerFactory.getLogger(SDNParser.class);

    @Value("${sdn.URL}")
    private String url;

    @PostConstruct
    void init() throws Exception {
        logger.info("url={}", url);
    }

    @Override
    public Sanctions parse() throws Exception {
        JAXBContext jaxbContext = JAXBContext.newInstance(Sanctions.class);
        Unmarshaller unmarshaller = jaxbContext.createUnmarshaller();
        Sanctions sanctions = (Sanctions) unmarshaller.unmarshal(new URL(url));
        logger.info("numSanctionEntries={}", sanctions.getSanctionsEntries().getSanctionsEntry().size());
        return sanctions;
    }
}
