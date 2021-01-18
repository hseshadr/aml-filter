package org.gainratio.amlfilter.service;

import org.dom4j.Document;
import org.dom4j.DocumentException;
import org.dom4j.Node;
import org.dom4j.io.SAXReader;
import org.gainratio.amlfilter.model.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.StringReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.Charset;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

@Component
public class NameRiskHelper implements SearchServiceInterface {
    private static final Logger logger = LoggerFactory.getLogger(NameRiskHelper.class);
    //http://localhost:21011/amlf-engine/jsp/production/index.jsp?searchXML=%3Csearch-request%20processId=%226%22%3E%20%3Csearch-names%3E%20%3Csearch-name%20uniqueId=%221234%22%20fullName=%22Mohammad%22%20entityType=%22PERSON%22%20gender=%22M%22/%3E%20%3C/search-names%3E%20%3C/search-request%3E";
    static String nameRiskSearchURL = "http://localhost:8080/amlf-engine/jsp/production/index.jsp?searchXML=";
    static final String nameRiskSearchXMLTemplate = "%3Csearch-request%20processId=%226%22%3E%20%3Csearch-names%3E%20%3Csearch-name%20uniqueId=%221234%22%20fullName=%22${NAME}%22%20entityType=%22PERSON%22%20gender=%22M%22/%3E%20%3C/search-names%3E%20%3C/search-request%3E";
    private static AtomicLong totalTime = new AtomicLong(0L);
    private static AtomicLong totalSearches = new AtomicLong(0L);

    @PostConstruct
    void init() {
        logger.info("USING NAMERISK SEARCH");
    }

    @Override
    public SearchResponse search(SearchRequest searchRequest) throws Exception {
        long startTime = System.currentTimeMillis();
        List<SearchRecordResults> searchRecordResultsList = new ArrayList<>();
        for (SearchRecord searchRecord : searchRequest.getSearchRecordList()) {
            String encodedName = URLEncoder.encode(searchRecord.getFullName(), Charset.defaultCharset().displayName());
            String searchXML = nameRiskSearchXMLTemplate.replace("${NAME}", encodedName);
            String response = makeHttpRequest(searchXML);
            //System.out.println(response);
            searchRecordResultsList.addAll(fromXML(response));
        }
        long endTime = System.currentTimeMillis();
        totalTime.addAndGet(endTime - startTime);
        totalSearches.incrementAndGet();
        return SearchResponse.builder().searchRecordResultList(searchRecordResultsList).build();
    }

    private List<SearchRecordResults> fromXML(String xml) throws DocumentException {
        List<SearchRecordResults> searchRecordResultsList = new ArrayList<>();
        Document xmlDocument = new SAXReader().read(new StringReader(xml));
        List searchRecordNodes = xmlDocument.selectNodes("/search-response/search-results/search-record");
        for (int i = 0; i < searchRecordNodes.size(); i++) {
            Node searchRecordNode = (Node) searchRecordNodes.get(i);
            String uniqueId = searchRecordNode.valueOf("@uniqueId");
            List<Node> results = searchRecordNode.selectNodes("results/result", "similarity");
            List<Result> resultList = new ArrayList<>();
            for (int j = results.size() - 1; j >= 0; j--) {
                Result result = new Result();
                result.setUniqueId(uniqueId);
                Node resultNode = results.get(j);

                String resultName = resultNode.selectSingleNode("name").getText();
                String resultNameInformationLevelStr = resultNode.selectSingleNode("information-level").getText();
                float resultNameInformationLevel = Float.parseFloat(resultNameInformationLevelStr);
                result.setResultNameInformationLevel((double) resultNameInformationLevel);
                result.setResultName(resultName);
                String entityCodeInSource = resultNode.selectSingleNode("code-in-source").getText();
                result.setEntityCodeInSource(entityCodeInSource);
                String similarityStr = resultNode.selectSingleNode("similarity").getText();
                float similarity = Float.parseFloat(similarityStr);
                result.setTextSimilarity((double) similarity);
                resultList.add(result);
            }
            SearchRecordResults searchRecordResults = SearchRecordResults.builder()
                    .results(resultList).build();
            searchRecordResultsList.add(searchRecordResults);
        }
        return searchRecordResultsList;
    }

    private String makeHttpRequest(String searchXML) throws IOException {
        String urlStr = nameRiskSearchURL + searchXML;
        //System.out.println("urlStr: " + urlStr);
        URL url = new URL(urlStr);
        HttpURLConnection con = (HttpURLConnection) url.openConnection();
        con.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
        con.setRequestMethod("GET");
        con.setConnectTimeout(5000);
        con.setReadTimeout(5000);

        BufferedReader in = new BufferedReader(
                new InputStreamReader(con.getInputStream()));
        String inputLine;
        StringBuffer content = new StringBuffer();
        while ((inputLine = in.readLine()) != null) {
            content.append(inputLine);
        }
        in.close();
        return content.toString();
    }
}
