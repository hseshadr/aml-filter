package org.gainratio.amlfilter.parser.eu;

import lombok.Data;
import org.gainratio.amlfilter.model.Entity;
import org.gainratio.amlfilter.parser.Parser;
import org.gainratio.amlfilter.parser.eu.dto.NameAlias;
import org.gainratio.amlfilter.parser.eu.dto.SanctionEntities;
import org.gainratio.amlfilter.parser.eu.dto.SanctionEntity;
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
public class EUParser implements Parser<List<Entity>> {
    public static final String LIST_NAME = "EU";
    private static final Logger logger = LoggerFactory.getLogger(EUParser.class);
    @Value("${eu.URL}")
    private String url;

    @PostConstruct
    void init() throws Exception {
        logger.info("url={}", url);
    }

    @Override
    public List<Entity> parse() throws Exception {
        SAXParserFactory factory = SAXParserFactory.newInstance();
        SAXParser saxParser = factory.newSAXParser();
        EUHandler euHandler = new EUHandler();
        saxParser.parse(url, euHandler);
        return convertSdnListToEntity(euHandler.getSanctionEntities());
    }

    private List<Entity> convertSdnListToEntity(SanctionEntities sanctionEntities) {
        List<Entity> entityList = new ArrayList<>();
        for (SanctionEntity sanctionEntity : sanctionEntities.getSanctionEntityList()) {
            Entity entity = new Entity();
            entity.setListName(LIST_NAME);
            entity.setEntityCodeInSource(sanctionEntity.getId());
            for (NameAlias nameAlias : sanctionEntity.getNameAliasList()) {
                entity.getEntityNameSet().add(nameAlias.getName());
            }
            entityList.add(entity);
        }
        return entityList;
    }
}
