package org.gainratio.amlfilter.service;

import org.gainratio.amlfilter.BaseUnitTest;
import org.gainratio.amlfilter.metrics.*;
import org.gainratio.amlfilter.model.*;
import org.gainratio.amlfilter.util.AlgorithmUtils;
import org.gainratio.amlfilter.util.StringUtils;
import org.junit.jupiter.api.Test;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
class SearchServiceTest extends BaseUnitTest {
    private static final Logger logger = LoggerFactory.getLogger(SearchServiceTest.class);

    @Autowired
    SearchService searchService;
    @Autowired
    EntityService entityService;

    static int entitiesCount = 0;
    static int nameCount = 0;
    static int okCase1Count = 0;
    static int case1Count = 0;  // Basic fuzzy test: just adding an x char whenever the name len > 10
    static List<String> case1Failed = new ArrayList<String>();

    @Test
        //@Disabled("Disabled until env is working!")
    void search() throws Exception {
        entityService.getEntityMap().values().stream().forEach(e -> {
            entitiesCount++;
            e.getEntityNameSet().stream().forEach(name -> {
                SearchRequest searchRequest = SearchRequest
                        .builder()
                        .searchRecordList(Arrays.asList(SearchRecord.builder().fullName(name).build())).build();
                SearchResponse searchResponse = searchService.search(searchRequest);
                logger.info("searchResponse={}", searchResponse);

                if (searchResponse.getSearchRecordResultList().get(0).getResults().size() == 0) {
                    logger.error("name={}, entitiesCount={}, totalNumEntitites={}", name, entitiesCount, entityService.getEntityMap().size());
                }
                List<Result> resultList = searchResponse.getSearchRecordResultList().get(0).getResults();
                if (resultList.size() > 0) {
                    Float sim = resultList.get(0).getTextSimilarity();
                    if (sim != 1.0) {
                        logger.error("name={}, sim={}, entitiesCount={}, totalNumEntitites={}", name, sim, entitiesCount, entityService.getEntityMap().size());
                    }
                    assertTrue(sim == 1.0);
                }
            });
        });
    }

    @Test
    void searchOneName() {
        String name = "فندق الجلاء";
        SearchRequest searchRequest = SearchRequest
                .builder()
                .searchRecordList(Arrays.asList(SearchRecord.builder().fullName(name).build())).build();
        SearchResponse searchResponse = searchService.search(searchRequest);
        logger.info("searchResponse={}", searchResponse);
        List<Result> resultList = searchResponse.getSearchRecordResultList().get(0).getResults();
        assertTrue(resultList.size() == 0);
    }

    @Test
        //@Disabled("Disabled until env is working!")
    void search_fuzzy1() throws Exception {
        resetStats();
        final float MIN_SIM = 0.8f; // *********
        entityService.getEntityMap().values().stream().forEach(e -> {
            entitiesCount++;
            if (entitiesCount%100==0) {
                logger.info("entitiesCount: {} ...", entitiesCount);
            }
            e.getEntityNameSet().stream().forEach(name -> {
                boolean usableCase = false;
                nameCount++;
                if (name.length() > 10) {
                    name = name + "x"; // breaking the names  // *********
                    usableCase=true;
                    case1Count++;
                }
                SearchRequest searchRequest = SearchRequest
                        .builder()
                        .searchRecordList(Arrays.asList(SearchRecord.builder().fullName(name).build())).build();
                SearchResponse searchResponse = searchService.search(searchRequest);
//                SearchResponse elasticResponse = elasticService.search(searchRequest);
//                logger.info("searchResponse={}", searchResponse);

                if (searchResponse.getSearchRecordResultList().get(0).getResults().size() == 0) {
                    logger.error("name={}, entitiesCount={}, totalNumEntitites={}", name, entitiesCount, entityService.getEntityMap().size());
                }
                List<Result> resultList = searchResponse.getSearchRecordResultList().get(0).getResults();
                if (resultList.size() > 0) {
                    Float sim = resultList.get(0).getTextSimilarity();
                    if (usableCase) {
                        if (sim <= MIN_SIM) {
                            logger.error("*** name={}, sim={}, entitiesCount={}, totalNumEntitites={}", name, sim, entitiesCount, entityService.getEntityMap().size());
                            case1Failed.add(name);
                        } else {
                            okCase1Count++;
                        }
                    }
//                    assertTrue(sim > MIN_SIM);
                }
            });
        });
        assertTrue(evaluationPasses());
    }

    @Test
        //@Disabled("Disabled until env is working!")
    void search_fuzzy_one_typo() throws Exception {
        FunctionalCaseOneTypo oneTypeTest = new FunctionalCaseOneTypo();
        resetStats();
        entityService.getEntityMap().values().forEach(e -> {
            entitiesCount++;
            String entityCodeInSource = e.getEntityCodeInSource();
            if (entitiesCount%100==0) {
                logger.info("(one_typo) entitiesCount: {} ...", entitiesCount);
            }
            e.getEntityNameSet().forEach(name -> {
                nameCount++;
                if (name.length() > 10) {
                        // with 3: caseCount=29696, recall=0.48841594827586204, precision=0.7572308656155372
                        // with 10: caseCount=13899, recall=0.8786963090869847, precision=0.860676532769556
                    String modName = oneTypeTest.modifyString(name);
                    oneTypeTest.incTestCaseCount();
                    SearchRequest searchRequest = SearchRequest
                            .builder()
                            .searchRecordList(Collections.singletonList(SearchRecord.builder().fullName(modName).build())).build();
                    SearchResponse searchResponse = searchService.search(searchRequest);

//                    if (searchResponse.getSearchRecordResultList().get(0).getResults().size() == 0) {
//                        logger.error("name={}, entitiesCount={}, totalNumEntitites={}", modName, entitiesCount, entityService.getEntityMap().size());
//                    }
                    List<Result> resultList = searchResponse.getSearchRecordResultList().get(0).getResults();
                    boolean found = false;
                    for (SearchRecordResults srr : searchResponse.getSearchRecordResultList()) {
                        for (Result result : srr.getResults()) {
                            if (entityCodeInSource.equals(result.getEntityCodeInSource())) found = true;
                            else {
                                oneTypeTest.incFalsePositives();
                                oneTypeTest.getFalsePositiveList().add("* FP: "+result.getResultName()+" -> searching for '"+modName+"'");
                            }
                        }
                    }
                    if (found) oneTypeTest.incTruePositives();
                    else {
                        oneTypeTest.getFalseNegativeList().add("* FN: "+name+" -> searching for '"+modName+"'");
                    }
                }
            });
        });
        assertTrue(oneTypeTest.passesEvaluation());
    }

    @Test
    void search_severalTest() throws Exception {
        List<FunctionalCase> functionalCases = new ArrayList<>();
        functionalCases.add(new FunctionalCaseExact());
        functionalCases.add(new FunctionalCaseOneTypo());
        functionalCases.add(new FunctionalCaseTwoTypos());
        functionalCases.add(new FunctionalCaseThreeTypos());
        functionalCases.add(new FunctionalCaseDoublingChars());
        functionalCases.add(new FunctionalCasePhonetic());
        functionalCases.add(new FunctionalCaseDeleteChar());
        functionalCases.add(new FunctionalCaseMixed1());

        long startTime = System.currentTimeMillis();

        for (FunctionalCase functionalCase : functionalCases) {
            entityService.getEntityMap().values().forEach(e -> {
                resetStats();
                entitiesCount++;
                String entityCodeInSource = e.getEntityCodeInSource();
                if (entitiesCount%1000==0) {
                    logger.info("("+functionalCase.getClass().getSimpleName()+") entitiesCount: {} ...", entitiesCount);
                }
                e.getEntityNameSet().forEach(origName -> {
                    nameCount++;
                    String name = AlgorithmUtils.cleanString(origName);
                    if (functionalCase.isNameAUsableCase(name)) {
                        // with 3: caseCount=29696, recall=0.48841594827586204, precision=0.7572308656155372
                        // with 10: caseCount=13899, recall=0.8786963090869847, precision=0.860676532769556
                        String modName = functionalCase.modifyString(name);
                        functionalCase.incTestCaseCount();
                        SearchRequest searchRequest = SearchRequest
                                .builder()
                                .searchRecordList(Collections.singletonList(SearchRecord.builder().fullName(modName).build())).build();
                        SearchResponse searchResponse = searchService.search(searchRequest);

//                    if (searchResponse.getSearchRecordResultList().get(0).getResults().size() == 0) {
//                        logger.error("name={}, entitiesCount={}, totalNumEntitites={}", modName, entitiesCount, entityService.getEntityMap().size());
//                    }
                        List<Result> resultList = searchResponse.getSearchRecordResultList().get(0).getResults();
                        boolean found = false;
                        for (SearchRecordResults srr : searchResponse.getSearchRecordResultList()) {
                            for (Result result : srr.getResults()) {
                                if (entityCodeInSource.equals(result.getEntityCodeInSource())) found = true;
                                else {
                                    functionalCase.incFalsePositives();
                                    functionalCase.getFalsePositiveList().add("* FP: "+result.getResultName()+" -> searching for '"+modName+"'");
                                }
                            }
                        }
                        if (found) functionalCase.incTruePositives();
                        else {
                            functionalCase.getFalseNegativeList().add("* FN: ("+entityCodeInSource+") "+name+" -> searching for '"+modName+"'");
                        }
                    }
                });
            });
            logger.info(
                    "## [METRICS] '"+functionalCase.getClass().getSimpleName()+"' ... "+
                            functionalCase.getDescription()+": "+
                            functionalCase.retrieveEvaluationResult());
        }

        logger.info("\n\n");
        logger.info("###### Cases logs:");
        for (FunctionalCase functionalCase : functionalCases) {
            logger.info("## Errors from test '"+functionalCase.getClass().getSimpleName()+"' ... "+functionalCase.getDescription()+": ");
            logger.info(functionalCase.retrieveTestLogs(10));
        }

        // Logging
        logger.info("\n\n");
        logger.info("###### Metrics summary:");
        for (FunctionalCase functionalCase : functionalCases) {
            logger.info(
                    "## [METRICS] '"+functionalCase.getClass().getSimpleName()+"' ... "+
                            functionalCase.getDescription()+": "+
                            functionalCase.retrieveEvaluationResult());
        }

        // Log test time
        long totalTime = System.currentTimeMillis()-startTime;
        logger.info("Total testing time(s): "+totalTime/1000 +" (mins: "+(totalTime/60000)+")");

        // Evaluate
        for (FunctionalCase functionalCase : functionalCases) {
            assertTrue(functionalCase.passesEvaluation());
        }
    }

//    private boolean evaluationPasses(FunctionalCase functionalCase) {
//        final double MIN_RECALL = 0.9;
//        final double MIN_PRECISION = 0.7;
//
//        double recall = (double)functionalCase.getTruePositives()/(double) functionalCase.getCaseCount();
//        double precision = (double)functionalCase.getTruePositives()/((double)functionalCase.getTruePositives()+(double)functionalCase.getFalsePositives());
//
//        String falseNegatives = "";
//        for (String fn : functionalCase.getFalseNegativeList()) {
//            falseNegatives+="\n\t"+fn;
//        }
//        logger.info("falseNegatives: {}",falseNegatives);
//
//        String falsePositives = "";
//        for (String fp : functionalCase.getFalsePositiveList()) {
//            falsePositives+="\n\t"+fp;
//        }
//        logger.info("falsePositives: {}",falsePositives);
//
//        logger.info("## caseCount={}, recall={}, precision={}", functionalCase.getCaseCount(), recall, precision);
//
//        if (recall>=MIN_RECALL && precision>MIN_PRECISION) return true;
//        return false;
//    }

    private boolean evaluationPasses() {
        final double MIN_RECALL = 0.9;

        double recall = (double)okCase1Count/(double) case1Count;

        String case1FailedNames = "";
        for (String case1FailedName : case1Failed) {
            case1FailedNames+="\n\t"+case1FailedName;
        }
        logger.info("case1FailedNames: {}",case1FailedNames);

        logger.info("## case1Count={}, okCase1Count={}", case1Count, okCase1Count);
        logger.info("## recall={}", recall);

        if (recall>=MIN_RECALL) return true;
        return false;
    }

    private void resetStats() {
        entitiesCount = 0;
        nameCount = 0;
        okCase1Count = 0;
        case1Count = 0;
        case1Failed.clear();
    }
}