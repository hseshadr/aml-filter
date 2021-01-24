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
    private float baseDistanceToSearch = 15f;
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
        final String methodSignature = "List executeQuery(String): ";
        long startTime = System.currentTimeMillis();
        List<Result> finalResults = new ArrayList<>();
        try {
            VectorSpace vs = getVectorSpaceService().getTrainedVs();
            double baseThresholdForTreeSearching = getBaseDistanceToSearch();
            // Making sure the vs loaded correctly
            if (null == vs) {
                throw new IllegalStateException(methodSignature + "The vector space is not set. Is the configuration of this process set properly in the database?");
            }
            String searchName = searchRecord.getCleanedName();

            VectorData vector2Search;
            List<TreeResult> treeResults;

            // There is nothing to search return no results
            if (0 == vs.size()) {
                return new ArrayList<>();
            }
            // ###################################################
            // ORIGINAL NAME SEARCH
            // ###################################################
            vector2Search = vs.createVector(searchName, vs.getOriginalComparatorWhenTraining());
            treeResults = vs.recursiveTreeSearch(vector2Search,
                    50,
                    baseThresholdForTreeSearching,
                    0,
                    false);


            for (int i = 0; i < treeResults.size(); i++) {
                logger.debug("\t- " +
                        treeResults.get(i).getFoundVectorData().getData() +
                        "; similarity: " + treeResults.get(i).getSimilarity());
            }


            // Transform the vector data to this version of the same one...
            finalResults = convertTreeResultsToResults(treeResults, searchRecord);

            // #########################################################
            // SYNONYMIC SEARCH
            // #########################################################
            String synonymicName = searchRecord.getSynonimicName();

            if (!synonymicName.equals(searchName)) {
                vector2Search = vs.createVector(synonymicName, vs.getOriginalComparatorWhenTraining());
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
            }
            finalResults.addAll(convertTreeResultsToResults(treeResults, searchRecord));
        } catch (Exception e) {
            e.printStackTrace();
        } finally {
            long endTime = System.currentTimeMillis();


            logger.debug(methodSignature + "Total time: " + (endTime - startTime));

        }
        return finalResults;
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

