package org.gainratio.amlfilter.service;

import org.apache.commons.io.IOUtils;
import org.apache.commons.lang3.StringUtils;
import org.gainratio.amlfilter.BaseUnitTest;
import org.gainratio.amlfilter.metrics.*;
import org.gainratio.amlfilter.model.*;
import org.gainratio.amlfilter.search.LuceneSearch;
import org.gainratio.amlfilter.util.AlgorithmUtils;
import org.gainratio.amlfilter.util.ResourceUtils;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

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
    VectorSpaceService vectorSpaceService;
    @Autowired
    NameRiskHelper nameRiskHelper;
    @Autowired
    ElasticSearchHelper elasticSearchHelper;
    @Autowired
    TokenService tokenService;
    @Autowired
    SynonymService synonymService;
    @Autowired
    LuceneSearch luceneSearch;

    static int nameCount = 0;
    List<EntityCodeAndNames> entityCodeAndNamesList;
    boolean runNameRiskTest = true;
    boolean runElasticSearchTest = true;
    boolean runNewSearchTest = true;

    boolean shouldLoadVs = false;

    @BeforeEach
    void init() {
    }

    @Test
    void searchOneName_newSearch() throws Exception {
        prepareSearch();
        String name = "FINANZAS DEL NORTE LUIS SAJEH Y CJA S C AND";
        Set<String> entityCodeSet = new HashSet<>(Arrays.asList("SDN_9890"));
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
    void search_severalTest_using_file_and_namerisk() throws Exception {
        if (!runNameRiskTest) {
            logger.warn("search_severalTest_using_file_and_namerisk: runNameRiskTest={}", runNameRiskTest);
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

        List<EntityCodeAndNames> entityCodeAndNamesList = prepareSearch();
        // Start the searches
        long startTime = System.currentTimeMillis();
        for (FunctionalCase functionalCase : functionalCases) {
            searchNameForFunctionalTestCase(functionalCase, entityCodeAndNamesList, nameRiskHelper, null);
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
        if (!runNewSearchTest) {
            logger.warn("search_severalTest_using_file_and_new_search: runNewSearchTest={}", runNewSearchTest);
        }
        List<EntityCodeAndNames> entityCodeAndNamesList = prepareSearch();

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
            logger.warn("search_severalTest_using_file_and_elastic_search: runElasticSearchTest={}", runElasticSearchTest);
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

        List<EntityCodeAndNames> entityCodeAndNamesList = prepareSearch();

        elasticSearchHelper.index(entityCodeAndNamesList);
        // Start the searches
        long startTime = System.currentTimeMillis();
        for (FunctionalCase functionalCase : functionalCases) {
            Map<String, Object> searchPreferencesMap = configureSearchPreferencesForElastic(functionalCase);
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

    private void searchNameForFunctionalTestCase(FunctionalCase functionalCase,
                                                 List<EntityCodeAndNames> entityCodeAndNamesList,
                                                 SearchServiceInterface searchServiceInterface,
                                                 Map<String, Object> searchPreferencesMap) throws Exception {
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
                    } else {
                        functionalCase.getFalseNegativeList().add("* FN: (" + nameAndEntityCode.getEntityCode() + ") " + name + " -> searching for '" + modName + "'");
                    }
                }
            }
        }
    }

    private List<EntityCodeAndNames> prepareSearch() throws Exception {
        entityCodeAndNamesList = createNameAndEntityCodeFromFile();
        entityService.buildNameToEntityCodesSetMapForTest(entityCodeAndNamesList);
        tokenService.init();
        luceneSearch.init();
        if (runNewSearchTest) {
            vectorSpaceService.populateVectorSpace(entityCodeAndNamesList);
            vectorSpaceService.train();
        }
        return entityCodeAndNamesList;
    }

    private Map<String, Object> configureSearchPreferencesForElastic(FunctionalCase functionalCase) {
        Map<String, Object> searchPreferencesMap = new HashMap<>();
        searchPreferencesMap.put("numResults", 2);
        searchPreferencesMap.put("exactSearchBoost", 1);
        searchPreferencesMap.put("phoneticBoost", 1);
        searchPreferencesMap.put("matchType", "most_fields");
        searchPreferencesMap.put("fuzziness", 3);

        switch (functionalCase.getClass().getSimpleName()) {
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

    private InputStream getResourceInputStream() throws IOException {
        return ResourceUtils.getResourceInputStream("test_names.dat");
    }

    private List<EntityCodeAndNames> createNameAndEntityCodeFromFile() throws IOException {
        List<EntityCodeAndNames> entityCodeAndNamesList = new ArrayList<>();
        InputStream is = getResourceInputStream();
        List<String> recordList = IOUtils.readLines(is, Charset.defaultCharset());
        Map<String, Set<String>> entityCodeToNameSetMap = new HashMap<>();
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
            String synName = synonymService.getSynonymName(name);
            if (!synName.equals(name)) {
                nameSet.add(synName);
            }
        }
        for (Map.Entry<String, Set<String>> entry : entityCodeToNameSetMap.entrySet()) {
            EntityCodeAndNames entityCodeAndNames = EntityCodeAndNames.builder()
                    .entityCode(entry.getKey())
                    .nameSet(entry.getValue())
                    .build();
            entityCodeAndNamesList.add(entityCodeAndNames);
        }
        return entityCodeAndNamesList;
    }
}