package org.gainratio.amlfilter.parser.eu;

import lombok.Getter;
import org.gainratio.amlfilter.parser.eu.dto.NameAlias;
import org.gainratio.amlfilter.parser.eu.dto.SanctionEntities;
import org.gainratio.amlfilter.parser.eu.dto.SanctionEntity;
import org.xml.sax.Attributes;
import org.xml.sax.SAXException;
import org.xml.sax.helpers.DefaultHandler;

@Getter
public class EUHandler extends DefaultHandler {
    private static final String SANCTION_ENTITY = "sanctionEntity";
    private static final String NAME_ALIAS = "nameAlias";

    private SanctionEntities sanctionEntities;
    private String elementValue;

    @Override
    public void characters(char[] ch, int start, int length) throws SAXException {
        elementValue = new String(ch, start, length);
    }

    @Override
    public void startDocument() throws SAXException {
        sanctionEntities = new SanctionEntities();
    }

    @Override
    public void startElement(String uri, String localName, String qName, Attributes attributes) throws SAXException {
        switch (qName) {
            case SANCTION_ENTITY:
                SanctionEntity sanctionEntity = new SanctionEntity();
                sanctionEntity.setId(attributes.getValue("logicalId"));
                sanctionEntities.getSanctionEntityList().add(sanctionEntity);
                break;
            case NAME_ALIAS:
                NameAlias nameAlias = new NameAlias();
                nameAlias.setName(attributes.getValue("wholeName"));
                latestSanctionEntity().getNameAliasList().add(nameAlias);
                break;
        }
    }

    @Override
    public void endElement(String uri, String localName, String qName) throws SAXException {
    }

    private SanctionEntity latestSanctionEntity() {
        int latestIndex = sanctionEntities.getSanctionEntityList().size() - 1;
        return sanctionEntities.getSanctionEntityList().get(latestIndex);
    }
}
