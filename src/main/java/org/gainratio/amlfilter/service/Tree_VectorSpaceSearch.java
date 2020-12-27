package org.gainratio.amlfilter.service;

import lombok.Data;
import lombok.EqualsAndHashCode;
import org.gainratio.amlfilter.model.Result;
import org.gainratio.amlfilter.model.SearchRecord;
import org.gainratio.amlfilter.search.NameSearch;
import org.gainratio.amlfilter.search.vectorSpace.TreeResult;
import org.gainratio.amlfilter.search.vectorSpace.VectorData4Tree;
import org.gainratio.amlfilter.search.vectorSpace.VectorSpace;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.*;


/**
 * Implements the name search interface in a manner that
 * performs a vector space search.
 */
@Data
@EqualsAndHashCode(callSuper = false)
@Service
public class Tree_VectorSpaceSearch extends NameSearch {
    private static final Logger logger = LoggerFactory.getLogger(Tree_VectorSpaceSearch.class);
    private float baseDistanceToSearch = 1f;
    @Autowired
    private ResultsService resultsService;
    @Autowired
    private SynonymService synonymService;
    @Autowired
    private VectorSpaceService vectorSpaceService;

    /**
     * Execute the query, in this case by invoking a phonetic
     * search in blacklist and then convert the blacklist members
     * into result objects
     */
    public List<Result> executeQuery(Map pParametersMap) throws Exception {
        final String methodSignature = "List executeQuery(String): ";
        long startTime = System.currentTimeMillis();
        try {
            SearchRecord searchRecord = (SearchRecord) pParametersMap.get("searchRecord");
            Map<String, List<String>> cumulativeSearchResultsMap = new HashMap<String, List<String>>();
            VectorSpace vs = getVectorSpaceService().getVectorSpace();
            double baseThresholdForTreeSearching = getBaseDistanceToSearch();
            // Making sure the vs loaded correctly
            if (null == vs) {
                throw new IllegalStateException(methodSignature + "The vector space is not set. Is the configuration of this process set properly in the database?");
            }
            String searchName = searchRecord.getCleanedSearchName();

            VectorData4Tree vector2Search = null;
            Map<String, List<String>> searchResultsMap = null;
            List<TreeResult> treeResults = null;

            // There is nothing to search return no results
            if (0 == vs.size()) {
                return new ArrayList<Result>();
            }
            // ###################################################
            // ORIGINAL NAME SEARCH
            // ###################################################
            long previousCheckPoint = System.currentTimeMillis();
            vector2Search = vs.createVector(searchName, vs.getOriginalComparatorWhenTraining());

            //logDebug(methodSignature + "%%%%%%%%%%%%%%%%%% baseThresholdForTreeSearching = " + baseThresholdForTreeSearching);
            previousCheckPoint = System.currentTimeMillis();
            treeResults = vs.recursiveTreeSearch(vector2Search,
                    20,
                    baseThresholdForTreeSearching,
                    0,
                    false);


            for (int i = 0; i < treeResults.size(); i++) {
                logger.info("\t- " +
                        treeResults.get(i).getFoundVectorData().getData() +
                        "; similarity: " + treeResults.get(i).getSimilarity());
            }


            // Transform the vector data to this version of the same one...
            searchResultsMap = getSearchResultsMap(treeResults, searchName, searchRecord);
            cumulativeSearchResultsMap.putAll(searchResultsMap);


            // #########################################################
            // SYNONYMIC SEARCH
            // #########################################################
            previousCheckPoint = System.currentTimeMillis();
            String synonymicName = getSynonymService().getSynonymName(searchName);

            if (!synonymicName.equals(searchName)) {
                previousCheckPoint = System.currentTimeMillis();
                vector2Search = vs.createVector(synonymicName, vs.getOriginalComparatorWhenTraining());


                previousCheckPoint = System.currentTimeMillis();
                treeResults = vs.recursiveTreeSearch(vector2Search,
                        20,
                        baseThresholdForTreeSearching,
                        0,
                        false);


                for (int i = 0; i < treeResults.size(); i++) {
                    logger.debug("\t- " +
                            treeResults.get(i).getFoundVectorData().getData() +
                            "; similarity: " + treeResults.get(i).getSimilarity());
                }


                // Transform the vector data to this version of the same one...
                previousCheckPoint = System.currentTimeMillis();
                searchResultsMap = getSearchResultsMap(treeResults, synonymicName, searchRecord);
                cumulativeSearchResultsMap.putAll(searchResultsMap);
            }

            List<Result> finalResults = assembleResults(cumulativeSearchResultsMap, pParametersMap, searchRecord);
            return finalResults;
        } finally {
            long endTime = System.currentTimeMillis();


            logger.debug(methodSignature + "Total time: " + (endTime - startTime));

        }
    }


    /**
     * Assemble result objects out of the vector result object
     *
     * @param pSearchResultsMap The search results map
     * @param pParametersMap    A map of parameters
     * @param pSearchRecord     The search record
     * @return An array of ids
     */
    public List<Result> assembleResults(Map<String, List<String>> pSearchResultsMap,
                                        Map pParametersMap,
                                        SearchRecord pSearchRecord) throws Exception {

        final String methodSignature = "List<VectorResult> assembleResults(Map<String,List<String>>,Map,SearchRecord): ";

        long startTime = System.currentTimeMillis();

        List<Result> results = new ArrayList<Result>();
        String uncleanedSearchName = pSearchRecord.getFullName();
        String searchName = null;
        Result result = null;
        List<String> resultNames = null;
        String resultName = null;
        Iterator<Map.Entry<String, List<String>>> searchResultsEntryIterator = pSearchResultsMap.entrySet().iterator();
        long hitTime = -1L;
        while (searchResultsEntryIterator.hasNext()) {
            Map.Entry<String, List<String>> searchResultsEntry = searchResultsEntryIterator.next();
            searchName = searchResultsEntry.getKey();
            resultNames = searchResultsEntry.getValue();

            for (int i = 0; i < resultNames.size(); i++) {
                resultName = resultNames.get(i);
                hitTime = System.currentTimeMillis();
                result = getResultsService().createResult(pSearchRecord,
                        null,
                        uncleanedSearchName,
                        searchName,
                        resultName,
                        null,
                        null,
                        null,
                        -1f,
                        hitTime);
                results.add(result);
            }
        }


        //isLoggingInfo()methodSignature + "Results : " + results);

        long endTime = System.currentTimeMillis();

        logger.debug(methodSignature + "Num Results : " + results.size());
        logger.debug(methodSignature + "Total time: " + (endTime - startTime));


        return results;
    }


    /**
     * Converts the vector result list from the tree search into a search result map
     * The key is the searched name, the value is a list of corresponding black list members
     *
     * @param pTreeVectorResultList The tree vector result list
     * @param pSearchedName         The searched name
     * @return The search result map
     */
    protected Map<String, List<String>> getSearchResultsMap(List<TreeResult> pTreeVectorResultList,
                                                            String pSearchedName,
                                                            SearchRecord pSearchRecord) {
        final String methodSignature = "Map<String,List<String>> getSearchResultsMap(List<TreeResult>,String,SearchRecord): ";

        long startTime = System.currentTimeMillis();
        TreeResult treeResult = null;
        VectorData4Tree treeVectorData = null;
        List<String> names = new ArrayList<String>();
        Map<String, List<String>> searchResultMap = new HashMap<String, List<String>>();

        logger.debug(methodSignature + "treeVectorResultList.size(): " + pTreeVectorResultList.size());

        for (int i = 0; i < pTreeVectorResultList.size(); i++) {
            treeResult = pTreeVectorResultList.get(i);
            treeVectorData = treeResult.getFoundVectorData();
            names.add(treeVectorData.getData());
        }

        searchResultMap.put(pSearchedName, names);
        long endTime = System.currentTimeMillis();


        logger.debug(methodSignature + "totalTime: " + (endTime - startTime));


        return searchResultMap;
    }
}

