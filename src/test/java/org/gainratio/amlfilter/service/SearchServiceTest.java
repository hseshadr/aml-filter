package org.gainratio.amlfilter.service;

import org.apache.commons.io.IOUtils;
import org.apache.commons.lang3.StringUtils;
import org.dom4j.DocumentException;
import org.gainratio.amlfilter.BaseUnitTest;
import org.gainratio.amlfilter.metrics.*;
import org.gainratio.amlfilter.model.*;
import org.gainratio.amlfilter.util.AlgorithmUtils;
import org.gainratio.amlfilter.util.ResourceUtils;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.io.ClassPathResource;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.Charset;
import java.util.*;

import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
class SearchServiceTest extends BaseUnitTest {
    private static final Logger logger = LoggerFactory.getLogger(SearchServiceTest.class);

    @Autowired
    SearchService searchService;
    @Autowired
    EntityService entityService;
    @Autowired
    WordService wordService;
    @Autowired
    VectorSpaceService vectorSpaceService;
    @Autowired
    NameRiskHelper nameRiskHelper;
    @Autowired
    ElasticSearchHelper elasticSearchHelper;

    static int entitiesCount = 0;
    static int nameCount = 0;
    static int okCase1Count = 0;
    static int case1Count = 0;  // Basic fuzzy test: just adding an x char whenever the name len > 10
    static List<String> case1Failed = new ArrayList<String>();
    List<EntityCodeAndNames> entityCodeAndNamesList;
    boolean loadAndTrainVsLocally = false;
    boolean runNameRiskTest = false;
    boolean runElasticSearchTest = false;

    @BeforeEach
    void init() throws Exception {
        if (loadAndTrainVsLocally) {
            entityCodeAndNamesList = createNameAndEntityCodeFromFile();
            entityService.buildNameToEntityCodesSetMapForTest(entityCodeAndNamesList);
            vectorSpaceService.populateVectorSpace(entityCodeAndNamesList);
            vectorSpaceService.train();
        }
        loadAndTrainVsLocally = false;
    }

    @Test
        //@Disabled("Disabled until env is working!")
    void search() throws Exception {
        entityService.getEntityCodeToEntityMap().values().stream().forEach(e -> {
            entitiesCount++;
            e.getEntityNameSet().stream().forEach(name -> {
                SearchRequest searchRequest = SearchRequest
                        .builder()
                        .searchRecordList(Arrays.asList(SearchRecord.builder().fullName(name).build())).build();
                SearchResponse searchResponse = searchService.search(searchRequest);
                logger.info("searchResponse={}", searchResponse);

                if (searchResponse.getSearchRecordResultList().get(0).getResults().size() == 0) {
                    logger.error("name={}, entitiesCount={}, totalNumEntitites={}", name, entitiesCount, entityService.getEntityCodeToEntityMap().size());
                }
                List<Result> resultList = searchResponse.getSearchRecordResultList().get(0).getResults();
                if (resultList.size() > 0) {
                    Double sim = resultList.get(0).getTextSimilarity();
                    if (sim != 1.0) {
                        logger.error("name={}, sim={}, entitiesCount={}, totalNumEntitites={}", name, sim, entitiesCount, entityService.getEntityCodeToEntityMap().size());
                    }
                    assertTrue(sim == 1.0);
                }
            });
        });
    }

    @Test
    void searchOneName() throws Exception {
        String name = "AYGUZTL HERRERA AGUILERA";
        Set<String> entityCodeSet = new HashSet<>(Arrays.asList("SDN_8581"));
        SearchRequest searchRequest = SearchRequest
                .builder()
                .searchRecordList(Arrays.asList(SearchRecord.builder()
                        .fullName(name).build())).build();
        SearchResponse searchResponse = searchService.search(searchRequest);
        logger.info("searchResponse={}", searchResponse);
        boolean found = false;
        for (SearchRecordResults srr : searchResponse.getSearchRecordResultList()) {
            for (Result result : srr.getResults()) {
                // Why match only by entityCodeInSource?? Since for entities we could
                // match many entity codes, I think we should match by name
                if (entityCodeSet.contains(result.getEntityCodeInSource())) {
                    found = true;
                    break;
                }
            }
        }
        assertTrue(found);
    }

    @Test
        //@Disabled("Disabled until env is working!")
    void search_fuzzy1() throws Exception {
        resetStats();
        final float MIN_SIM = 0.8f; // *********
        entityService.getEntityCodeToEntityMap().values().stream().forEach(e -> {
            entitiesCount++;
            if (entitiesCount % 100 == 0) {
                logger.info("entitiesCount: {} ...", entitiesCount);
            }
            e.getEntityNameSet().stream().forEach(name -> {
                boolean usableCase = false;
                nameCount++;
                if (name.length() > 10) {
                    name = name + "x"; // breaking the names  // *********
                    usableCase = true;
                    case1Count++;
                }
                SearchRequest searchRequest = SearchRequest
                        .builder()
                        .searchRecordList(Arrays.asList(SearchRecord.builder().fullName(name).build())).build();
                SearchResponse searchResponse = searchService.search(searchRequest);
//                SearchResponse elasticResponse = elasticService.search(searchRequest);
//                logger.info("searchResponse={}", searchResponse);

                if (searchResponse.getSearchRecordResultList().get(0).getResults().size() == 0) {
                    logger.error("name={}, entitiesCount={}, totalNumEntitites={}", name, entitiesCount, entityService.getEntityCodeToEntityMap().size());
                }
                List<Result> resultList = searchResponse.getSearchRecordResultList().get(0).getResults();
                if (resultList.size() > 0) {
                    Double sim = resultList.get(0).getTextSimilarity();
                    if (usableCase) {
                        if (sim <= MIN_SIM) {
                            logger.error("*** name={}, sim={}, entitiesCount={}, totalNumEntitites={}", name, sim, entitiesCount, entityService.getEntityCodeToEntityMap().size());
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
        entityService.getEntityCodeToEntityMap().values().forEach(e -> {
            entitiesCount++;
            String entityCodeInSource = e.getEntityCodeInSource();
            if (entitiesCount % 100 == 0) {
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
                                oneTypeTest.getFalsePositiveList().add("* FP: " + result.getResultName() + " -> searching for '" + modName + "'");
                            }
                        }
                    }
                    if (found) oneTypeTest.incTruePositives();
                    else {
                        oneTypeTest.getFalseNegativeList().add("* FN: " + name + " -> searching for '" + modName + "'");
                    }
                }
            });
        });
        assertTrue(oneTypeTest.passesEvaluation());
    }

    private void searchNameForFunctionalTestCase(FunctionalCase functionalCase,
                                                 List<EntityCodeAndNames> entityCodeAndNamesList,
                                                 SearchServiceInterface searchServiceInterface,
                                                 Map<String,Object> searchPreferencesMap) throws Exception {
        for (EntityCodeAndNames nameAndEntityCode : entityCodeAndNamesList) {
            nameCount++;
            for (String name : nameAndEntityCode.getNameSet()) {
                name = AlgorithmUtils.cleanString(name);
                if (functionalCase.isNameAUsableCase(name)) {
                    String modName = functionalCase.modifyString(name);
                    SearchRequest searchRequest = SearchRequest
                            .builder()
                            .searchPreferencesMap(searchPreferencesMap)
                            .searchRecordList(Collections
                                    .singletonList(SearchRecord.builder()
                                            .fullName(modName).build()))
                            .build();
                    SearchResponse searchResponse = searchServiceInterface.search(searchRequest);
                    List<Result> resultList = searchResponse.getSearchRecordResultList().get(0).getResults();
                    functionalCase.incTestCaseCount();
                    boolean found = false;
                    for (SearchRecordResults srr : searchResponse.getSearchRecordResultList()) {
                        functionalCase.incTotalResultsCount(srr.getResults().size());
                        for (Result result : srr.getResults()) {
                            if (nameAndEntityCode.getEntityCode().equals(result.getEntityCodeInSource())) {
                                found = true;
                            } else {
                                functionalCase.incFalsePositives();
                                functionalCase.getFalsePositiveList().add("* FP: " + result.getResultName() +
                                        " -> searching for '" + modName + "'" + "; results.size(): " + resultList.size());
                            }
                        }
                    }
                    if (found) {
                        functionalCase.incTruePositives();
                    }
                    else {
                        functionalCase.getFalseNegativeList().add("* FN: (" + nameAndEntityCode.getEntityCode() + ") " + name + " -> searching for '" + modName + "'");
                    }
                }
            }
        }
    }

    @Test
    void search_severalTest_using_file_and_namerisk() throws Exception {
        if (!runNameRiskTest) {
            return;
        }
        List<FunctionalCase> functionalCases = new ArrayList<>();
        functionalCases.add(new FunctionalCaseExact());
        functionalCases.add(new FunctionalCaseOneTypo());
        functionalCases.add(new FunctionalCaseTwoTypos());
        functionalCases.add(new FunctionalCaseThreeTypos());
        functionalCases.add(new FunctionalCaseDeleteChar());
        functionalCases.add(new FunctionalCaseDoublingChars());
        functionalCases.add(new FunctionalCasePhonetic());
        functionalCases.add(new FunctionalCaseMixed1());

        List<EntityCodeAndNames> entityCodeAndNamesList = createNameAndEntityCodeFromFile();
        // Start the searches
        long startTime = System.currentTimeMillis();
        for (FunctionalCase functionalCase : functionalCases) {
            searchNameForFunctionalTestCase(functionalCase, entityCodeAndNamesList, nameRiskHelper,null);
            logger.info(
                    "## [METRICS] '" + functionalCase.getClass().getSimpleName() + "' ... " +
                            functionalCase.getDescription() + ": " +
                            functionalCase.retrieveEvaluationResult());
        }
        logger.info("\n\n");
        logger.info("###### Cases logs:");
        for (FunctionalCase functionalCase : functionalCases) {
            logger.info("## Errors from test '" + functionalCase.getClass().getSimpleName() + "' ... " + functionalCase.getDescription() + ": ");
            logger.info(functionalCase.retrieveTestLogs(10));
        }

        // Logging
        logger.info("\n\n");
        logger.info("###### Metrics summary:");
        for (FunctionalCase functionalCase : functionalCases) {
            logger.info(
                    "## [METRICS] '" + functionalCase.getClass().getSimpleName() + "' ... " +
                            functionalCase.getDescription() + ": " +
                            functionalCase.retrieveEvaluationResult());
        }

        // Log test time
        long totalTime = System.currentTimeMillis() - startTime;
        logger.info("Total testing time(s): " + totalTime / 1000 + " (mins: " + (totalTime / 60000) + ")");
        // Evaluate
        for (FunctionalCase functionalCase : functionalCases) {
            assertTrue(functionalCase.passesEvaluation());
        }
    }

    @Test
    void search_severalTest_using_file_and_new_search() throws Exception {
        entityCodeAndNamesList = createNameAndEntityCodeFromFile();
        entityService.buildNameToEntityCodesSetMapForTest(entityCodeAndNamesList);
        vectorSpaceService.populateVectorSpace(entityCodeAndNamesList);
        vectorSpaceService.train();

        List<FunctionalCase> functionalCases = new ArrayList<>();
        functionalCases.add(new FunctionalCaseExact());
        functionalCases.add(new FunctionalCaseOneTypo());
        functionalCases.add(new FunctionalCaseTwoTypos());
        functionalCases.add(new FunctionalCaseThreeTypos());
        functionalCases.add(new FunctionalCaseDeleteChar());
        functionalCases.add(new FunctionalCaseDoublingChars());
        functionalCases.add(new FunctionalCasePhonetic());
        functionalCases.add(new FunctionalCaseMixed1());

        // Start the searches
        long startTime = System.currentTimeMillis();
        for (FunctionalCase functionalCase : functionalCases) {
            searchNameForFunctionalTestCase(functionalCase, entityCodeAndNamesList, searchService, null);
            logger.info(
                    "## [METRICS] '" + functionalCase.getClass().getSimpleName() + "' ... " +
                            functionalCase.getDescription() + ": " +
                            functionalCase.retrieveEvaluationResult());
        }
        logger.info("\n\n");
        logger.info("###### Cases logs:");
        for (FunctionalCase functionalCase : functionalCases) {
            logger.info("## Errors from test '" + functionalCase.getClass().getSimpleName() + "' ... " + functionalCase.getDescription() + ": ");
            logger.info(functionalCase.retrieveTestLogs(10));
        }

        // Logging
        logger.info("\n\n");
        logger.info("###### Metrics summary:");
        for (FunctionalCase functionalCase : functionalCases) {
            logger.info(
                    "## [METRICS] '" + functionalCase.getClass().getSimpleName() + "' ... " +
                            functionalCase.getDescription() + ": " +
                            functionalCase.retrieveEvaluationResult());
        }

        // Log test time
        long totalTime = System.currentTimeMillis() - startTime;
        logger.info("Total testing time(s): " + totalTime / 1000 + " (mins: " + (totalTime / 60000) + ")");
        // Evaluate
        for (FunctionalCase functionalCase : functionalCases) {
            assertTrue(functionalCase.passesEvaluation());
        }
    }

    @Test
    void search_severalTest_using_file_and_elastic_search() throws Exception {
        if (!runElasticSearchTest) {
            return;
        }
        List<FunctionalCase> functionalCases = new ArrayList<>();
        functionalCases.add(new FunctionalCaseExact());
        functionalCases.add(new FunctionalCaseOneTypo());
        functionalCases.add(new FunctionalCaseTwoTypos());
        functionalCases.add(new FunctionalCaseThreeTypos());
        functionalCases.add(new FunctionalCaseDeleteChar());
        functionalCases.add(new FunctionalCaseDoublingChars());
        functionalCases.add(new FunctionalCasePhonetic());
        functionalCases.add(new FunctionalCaseMixed1());


        List<EntityCodeAndNames> entityCodeAndNamesList = createNameAndEntityCodeFromFile();
        elasticSearchHelper.index(entityCodeAndNamesList);
        // Start the searches
        long startTime = System.currentTimeMillis();
        for (FunctionalCase functionalCase : functionalCases) {
            Map<String,Object> searchPreferencesMap = configureSearchPreferencesForElastic(functionalCase);
            searchNameForFunctionalTestCase(functionalCase, entityCodeAndNamesList,
                    elasticSearchHelper, searchPreferencesMap);
            logger.info(
                    "## [METRICS] '" + functionalCase.getClass().getSimpleName() + "' ... " +
                            functionalCase.getDescription() + ": " +
                            functionalCase.retrieveEvaluationResult());
        }
        logger.info("\n\n");
        logger.info("###### Cases logs:");
        for (FunctionalCase functionalCase : functionalCases) {
            logger.info("## Errors from test '" + functionalCase.getClass().getSimpleName() + "' ... " + functionalCase.getDescription() + ": ");
            logger.info(functionalCase.retrieveTestLogs(10));
        }

        // Logging
        logger.info("\n\n");
        logger.info("###### Metrics summary:");
        for (FunctionalCase functionalCase : functionalCases) {
            logger.info(
                    "## [METRICS] '" + functionalCase.getClass().getSimpleName() + "' ... " +
                            functionalCase.getDescription() + ": " +
                            functionalCase.retrieveEvaluationResult());
        }

        // Log test time
        long totalTime = System.currentTimeMillis() - startTime;
        logger.info("Total testing time(s): " + totalTime / 1000 + " (mins: " + (totalTime / 60000) + ")");
        // Evaluate
        for (FunctionalCase functionalCase : functionalCases) {
            assertTrue(functionalCase.passesEvaluation());
        }
    }

    private Map<String,Object> configureSearchPreferencesForElastic(FunctionalCase functionalCase) {
        Map<String,Object> searchPreferencesMap = new HashMap<>();
        searchPreferencesMap.put("numResults", 2);
        searchPreferencesMap.put("exactSearchBoost", 1);
        searchPreferencesMap.put("phoneticBoost", 1);
        searchPreferencesMap.put("matchType", "most_fields");
        searchPreferencesMap.put("fuzziness", 3);

        switch(functionalCase.getClass().getSimpleName()) {
            case "FunctionalCaseExact":
                searchPreferencesMap.put("fuzziness", 0);
                searchPreferencesMap.put("exactSearchBoost", 3);
                break;
            case "FunctionalCaseOneTypo":
                searchPreferencesMap.put("fuzziness", 1);
                break;
            case "FunctionalCaseTwoTypos":
                searchPreferencesMap.put("fuzziness", 2);
                break;
            case "FunctionalCaseThreeTypos":
                searchPreferencesMap.put("fuzziness", 3);
                break;
            case "FunctionalCasePhonetic":
                searchPreferencesMap.put("phoneticBoost", 2);
                break;
            case "FunctionalCaseMixed1":
                searchPreferencesMap.put("phoneticBoost", 2);
                searchPreferencesMap.put("fuzziness", 4);
                break;
        }
        return searchPreferencesMap;
    }

    private boolean evaluationPasses() {
        final double MIN_RECALL = 0.9;

        double recall = (double) okCase1Count / (double) case1Count;

        String case1FailedNames = "";
        for (String case1FailedName : case1Failed) {
            case1FailedNames += "\n\t" + case1FailedName;
        }
        logger.info("case1FailedNames: {}", case1FailedNames);

        logger.info("## case1Count={}, okCase1Count={}", case1Count, okCase1Count);
        logger.info("## recall={}", recall);

        if (recall >= MIN_RECALL) return true;
        return false;
    }

    private void resetStats() {
        entitiesCount = 0;
        nameCount = 0;
        okCase1Count = 0;
        case1Count = 0;
        case1Failed.clear();
    }

    private InputStream getResourceInputStream() throws IOException {
        return ResourceUtils.getResourceInputStream("test_names.dat");
    }

    private List<EntityCodeAndNames> createNameAndEntityCodeFromFile() throws IOException {
        List<EntityCodeAndNames> entityCodeAndNamesList = new ArrayList<>();
        InputStream is = getResourceInputStream();
        List<String> recordList = IOUtils.readLines(is, Charset.defaultCharset());
        Map<String,Set<String>> entityCodeToNameSetMap = new HashMap<>();
        for (String record : recordList) {
            String[] tokens = record.split(",");
            String entityCodeInSource = tokens[0].trim();
            String name = tokens[1];
            if (StringUtils.isBlank(name)) {
                continue;
            }
            name = AlgorithmUtils.cleanString(name);
            Set<String> nameSet = entityCodeToNameSetMap.get(entityCodeInSource);
            if (null == nameSet) {
                nameSet = new LinkedHashSet<>();
                entityCodeToNameSetMap.put(entityCodeInSource, nameSet);
            }
            nameSet.add(name);
        }
        for (Map.Entry<String,Set<String>> entry : entityCodeToNameSetMap.entrySet()) {
            EntityCodeAndNames entityCodeAndNames = EntityCodeAndNames.builder()
                    .entityCode(entry.getKey())
                    .nameSet(entry.getValue())
                    .build();
            entityCodeAndNamesList.add(entityCodeAndNames);
        }
        return entityCodeAndNamesList;
    }
}