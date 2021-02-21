package org.gainratio.amlfilter.parser.ofac;

import lombok.Data;
import org.gainratio.amlfilter.model.Entity;
import org.gainratio.amlfilter.parser.Parser;
import org.gainratio.amlfilter.parser.ofac.dto.Aka;
import org.gainratio.amlfilter.parser.ofac.dto.SdnEntry;
import org.gainratio.amlfilter.parser.ofac.dto.SdnList;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;
import javax.xml.parsers.SAXParser;
import javax.xml.parsers.SAXParserFactory;
import java.util.ArrayList;
import java.util.List;

@Component
@Data
public class SDNParser implements Parser<List<Entity>> {
    public static final String LIST_NAME = "SDN";
    private static final Logger logger = LoggerFactory.getLogger(SDNParser.class);
    @Value("${sdn.URL}")
    private String url;

    @PostConstruct
    void init() throws Exception {
        logger.info("url={}", url);
    }

    @Override
    public List<Entity> parse() throws Exception {
        SAXParserFactory factory = SAXParserFactory.newInstance();
        SAXParser saxParser = factory.newSAXParser();
        SDNHandler sdnHandler = new SDNHandler();
        saxParser.parse(url, sdnHandler);
        return convertSdnListToEntity(sdnHandler.getSdnList());
    }

    private List<Entity> convertSdnListToEntity(SdnList sdnList) {
        List<Entity> entityList = new ArrayList<>();
        for (SdnEntry sdnEntry : sdnList.getSdnEntryList()) {
            Entity entity = new Entity();
            entity.setListName(LIST_NAME);
            entity.setEntityCodeInSource(sdnEntry.getUid());
            entity.getEntityNameSet().add(sdnEntry.getLastName());
            for (Aka aka : sdnEntry.getAkaList().getAkaList()) {
                entity.getEntityNameSet().add(aka.getLastName());
            }
            entityList.add(entity);
        }
        return entityList;
    }
}
