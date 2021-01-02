package org.gainratio.amlfilter.parser.ofac;

import lombok.Data;
import org.gainratio.amlfilter.eu.ExportType;
import org.gainratio.amlfilter.sdn.Sanctions;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import org.w3c.dom.Document;
import org.w3c.dom.NamedNodeMap;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

import javax.annotation.PostConstruct;
import javax.xml.bind.JAXBContext;
import javax.xml.bind.Unmarshaller;
import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.xpath.XPath;
import javax.xml.xpath.XPathConstants;
import javax.xml.xpath.XPathFactory;
import java.net.URL;

@Component
@Data
public class EUParser implements Parser<ExportType> {
    private static final Logger logger = LoggerFactory.getLogger(EUParser.class);

    @Value("${eu.URL}")
    private String url;

    @PostConstruct
    void init() throws Exception {
        logger.info("url={}", url);
    }

    @Override
    public ExportType parse() throws Exception {
        DocumentBuilderFactory builderFactory = DocumentBuilderFactory.newInstance();
        DocumentBuilder builder = builderFactory.newDocumentBuilder();
        Document xmlDocument = builder.parse(new ClassPathResource("eu_full.xml", getClass().getClassLoader()).getInputStream());
        XPath xPath = XPathFactory.newInstance().newXPath();
        String expression = "/export/sanctionEntity";
        NodeList nodeList = (NodeList) xPath.compile(expression).evaluate(xmlDocument, XPathConstants.NODESET);
        int length =  nodeList.getLength();
        for (int i=0; i < length; i++) {
            Node node = nodeList.item(i);
            System.out.println(node.getAttributes().getNamedItem("logicalId").getNodeValue());
            NodeList childNodes = node.getChildNodes();
            if (node.getNodeType() == Node.ELEMENT_NODE) {
                if (node.getNodeName().equals("nameAlias")) {

                }
            }
        }
        return null;
    }
}
