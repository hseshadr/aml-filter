package org.gainratio.amlfilter.service;

import lombok.Data;
import lombok.EqualsAndHashCode;
import org.gainratio.amlfilter.model.Result;
import org.gainratio.amlfilter.model.SearchRecord;
import org.gainratio.amlfilter.search.NameSearch;
import org.gainratio.amlfilter.vector.vectorSpace.TreeResult;
import org.gainratio.amlfilter.vector.vectorSpace.VectorData;
import org.gainratio.amlfilter.vector.vectorSpace.VectorSpace;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;


/**
 * Implements the name search interface in a manner that
 * performs a vector space search.
 */
@Data
@EqualsAndHashCode(callSuper = false)
@Service
public class Tree_VectorSpaceSearch extends NameSearch {
    private static final Logger logger = LoggerFactory.getLogger(Tree_VectorSpaceSearch.class);
    boolean enabled = true;
    private float baseDistanceToSearch = 15f;
    private int maxResults = 50;
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
    public List<Result> executeQuery(SearchRecord searchRecord) {
        long startTime = System.nanoTime();
        final String methodSignature = "List executeQuery(String): ";
        List<Result> finalResults = new ArrayList<>();
        if (!enabled) {
            return finalResults;
        }
        try {
            VectorSpace vs = getVectorSpaceService().getTrainedVs();
            // Making sure the vs loaded correctly
            if (null == vs || vs.size() == 0) {
                throw new IllegalStateException(methodSignature + "The vector space is not set. Is the configuration of this process set properly in the database?");
            }
            // Original search
            String searchName = searchRecord.getCleanedName();
            List<Result> originalNameResults = searchVectorSpace(searchRecord, searchRecord.getCleanedName(), vs);
            finalResults.addAll(originalNameResults);
            // Synonym search
            String synonymicName = searchRecord.getSynonimicName();
            if (!synonymicName.equals(searchName)) {
                List<Result> synonymicResults = searchVectorSpace(searchRecord, synonymicName, vs);
                finalResults.addAll(synonymicResults);
            }
        } catch (Exception e) {
            logger.error("ERROR: ", e);
        } finally {
            if (Math.abs(startTime % 500) == 16) {
                long endTime = System.nanoTime();
                logger.info("Search time(ms): {}", (double) (endTime - startTime) / 1000000d);
            }
        }
        return finalResults;
    }

    private List<Result> searchVectorSpace(SearchRecord searchRecord, String name, VectorSpace vectorSpace) throws Exception {
        VectorData vector2Search;
        List<TreeResult> treeResults;
        vector2Search = vectorSpace.createVector(name, vectorSpace.getOriginalComparatorWhenTraining());
        treeResults = vectorSpace.recursiveTreeSearch(vector2Search,
                maxResults,
                baseDistanceToSearch,
                0,
                false);
        return convertTreeResultsToResults(treeResults, searchRecord);
    }


    private List<Result> convertTreeResultsToResults(List<TreeResult> treeVectorResultList, SearchRecord searchRecord) {
        List<Result> resultList = new ArrayList<>();
        for (TreeResult tr : treeVectorResultList) {
            Result result = resultsService.createResult(searchRecord.getFullName(),
                    tr.getFoundVectorData().getData(), tr.getFoundVectorData().getId(), "SDN", getClass().getSimpleName(), tr.getSimilarity());
            resultList.add(result);
        }
        return resultList;
    }
}

