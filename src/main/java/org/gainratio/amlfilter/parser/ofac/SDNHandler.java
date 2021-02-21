package org.gainratio.amlfilter.parser.ofac;

import lombok.Getter;
import org.gainratio.amlfilter.parser.ofac.dto.*;
import org.xml.sax.Attributes;
import org.xml.sax.SAXException;
import org.xml.sax.helpers.DefaultHandler;

@Getter
public class SDNHandler extends DefaultHandler {
    private static final String SDN_LIST = "sdnList";
    private static final String PUBLISH_INFO = "publshInformation";
    private static final String PUBLISH_DATE = "Publish_Date";
    private static final String RECORD_COUNT = "Record_Count";
    private static final String SDN_ENTRY = "sdnEntry";
    private static final String UID = "uid";
    private static final String LAST_NAME = "lastName";
    private static final String AKA_LIST = "akaList";
    private static final String AKA = "aka";

    private SdnList sdnList;
    private String elementValue;
    private boolean inAka;

    @Override
    public void characters(char[] ch, int start, int length) throws SAXException {
        elementValue = new String(ch, start, length);
    }

    @Override
    public void startElement(String uri, String localName, String qName, Attributes attributes) throws SAXException {
        switch (qName) {
            case SDN_LIST:
                sdnList = new SdnList();
                break;
            case PUBLISH_INFO:
                sdnList.setPublishInformation(new PublishInformation());
                break;
            case SDN_ENTRY:
                sdnList.getSdnEntryList().add(new SdnEntry());
                break;
            case AKA_LIST:
                latestSdnEntry().setAkaList(new AkaList());
                break;
            case AKA:
                latestSdnEntry().getAkaList().getAkaList().add(new Aka());
                inAka = true;
                break;
        }
    }

    @Override
    public void endElement(String uri, String localName, String qName) throws SAXException {
        switch (qName) {
            case PUBLISH_DATE:
                sdnList.getPublishInformation().setPublishDate(elementValue);
                break;
            case RECORD_COUNT:
                sdnList.getPublishInformation().setRecordCount(Integer.parseInt(elementValue));
                break;
            case UID:
                if (inAka) {
                    latestAka().setUid(elementValue);
                } else {
                    latestSdnEntry().setUid(elementValue);
                }
                break;
            case LAST_NAME:
                if (inAka) {
                    latestAka().setLastName(elementValue);
                } else {
                    latestSdnEntry().setLastName(elementValue);
                }
                break;
            case AKA:
                inAka = false;
                break;

        }
    }

    private SdnEntry latestSdnEntry() {
        int latestIndex = sdnList.getSdnEntryList().size() - 1;
        return sdnList.getSdnEntryList().get(latestIndex);
    }

    private Aka latestAka() {
        int latestIndex = latestSdnEntry().getAkaList().getAkaList().size() - 1;
        return latestSdnEntry().getAkaList().getAkaList().get(latestIndex);
    }
}
