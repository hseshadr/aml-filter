package org.gainratio.amlfilter.service;

import org.apache.commons.io.IOUtils;
import org.apache.commons.lang3.StringUtils;
import org.gainratio.amlfilter.BaseUnitTest;
import org.gainratio.amlfilter.metrics.*;
import org.gainratio.amlfilter.model.*;
import org.gainratio.amlfilter.parser.general.NrfParser;
import org.gainratio.amlfilter.parser.general.TsvParser;
import org.gainratio.amlfilter.search.ElasticSearch;
import org.gainratio.amlfilter.search.ElasticSearchHelper;
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
    ElasticSearch elasticSearch;
    @Autowired
    SynonymService synonymService;

    static int nameCount = 0;
    List<EntityCodeAndNames> entityCodeAndNamesList;

    @BeforeEach
    void init() {
    }

    @Test
    void search_severalTest_using_file_and_elastic_search() throws Exception {
        List<EntityCodeAndNames> entityCodeAndNamesList = prepareSearch();
        List<FunctionalCase> functionalCases = new ArrayList<>();
        functionalCases.add(new FunctionalCaseExact(entityCodeAndNamesList));
        functionalCases.add(new FunctionalCaseOneTypo(entityCodeAndNamesList));
        functionalCases.add(new FunctionalCaseTwoTypos(entityCodeAndNamesList));
        functionalCases.add(new FunctionalCaseThreeTypos(entityCodeAndNamesList));
        functionalCases.add(new FunctionalCaseDeleteChar(entityCodeAndNamesList));
        functionalCases.add(new FunctionalCaseDoublingChars(entityCodeAndNamesList));
        functionalCases.add(new FunctionalCasePhonetic(entityCodeAndNamesList));
        functionalCases.add(new FunctionalCaseMixed1(entityCodeAndNamesList));

        ElasticSearchHelper elasticSearchHelper = elasticSearch.getElasticSearchHelper();
        elasticSearchHelper.index(entityCodeAndNamesList);
        // Start the searches
        long startTime = System.currentTimeMillis();
        for (FunctionalCase functionalCase : functionalCases) {
            Map<String, Object> searchPreferencesMap = configureSearchPreferencesForElastic(functionalCase);
            searchNameForFunctionalTestCase(functionalCase, functionalCase.getEntitiesToSearch(),
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
                            if (nameAndEntityCode.getEntityCode()!=null // if set to null, it is not supposed to be found.
                                    && nameAndEntityCode.getEntityCode().equals(result.getEntityCodeInSource())) {
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
            // progress logging
            if (nameCount%5000==0) {
                logger.info("## progress: "+nameCount+"/"+entityCodeAndNamesList.size());
            }

        }
    }

    private List<EntityCodeAndNames> prepareSearch() throws Exception {
        entityCodeAndNamesList = createNameAndEntityCodeFromFile();
        entityService.buildNameToEntityCodesSetMapForTest(entityCodeAndNamesList);
        elasticSearch.getElasticSearchHelper().index(entityCodeAndNamesList);
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