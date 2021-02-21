package org.gainratio.amlfilter.service;

import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.gainratio.amlfilter.loader.LoaderInfo;
import org.gainratio.amlfilter.model.EntityCodeAndNames;
import org.gainratio.amlfilter.model.GenericEvent;
import org.gainratio.amlfilter.util.AlgorithmUtils;
import org.gainratio.amlfilter.vector.comparisonCriteria.*;
import org.gainratio.amlfilter.vector.test.test_hierarchy_treeSearch;
import org.gainratio.amlfilter.vector.vectorSpace.Hierarchy_utils;
import org.gainratio.amlfilter.vector.vectorSpace.VectorDefinition;
import org.gainratio.amlfilter.vector.vectorSpace.VectorSpace;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationListener;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
import java.io.BufferedWriter;
import java.io.IOException;
import java.io.OutputStreamWriter;
import java.util.Collections;
import java.util.List;

/**
 * Maintains and loads the search engine resources atomically
 */
@Service
@Data
@Slf4j
public class VectorSpaceService implements ApplicationListener<GenericEvent>  {
    private static final Logger logger = LoggerFactory.getLogger(VectorSpaceService.class);
    private static final Hierarchy_utils hu = new Hierarchy_utils();
    // Define the comparison criteria
    VsCriteria_Distance comparator_distance = new VsCriteria_Distance();
    VsCriteria_Distance_Normalized comparator_distNorm = new VsCriteria_Distance_Normalized();
    VsCriteria_PairSimilarity comparator_pairSim = new VsCriteria_PairSimilarity();
    VsCriteria_JaroWinklerSimilarity comparator_jaroWinklerSim = new VsCriteria_JaroWinklerSimilarity();
    VsCriteria_Cosine comparator_cosine = new VsCriteria_Cosine();
    VsCriteria_CompAlgs comparator_compAlgs = new VsCriteria_CompAlgs();
    VsComparisonCriteriaHandler comparator_forTraining = comparator_pairSim;
    private VectorSpace rawVs;
    private VectorSpace trainedVs;
    @Autowired
    private EntityService entityService;

    @PostConstruct
    public void init() throws IOException {
        rawVs = createVectorSpace();
        Hierarchy_utils.log = new BufferedWriter(new OutputStreamWriter(System.out, rawVs.getVectorManager().getLocale().getDisplayName()));
    }

    private VectorSpace createVectorSpace() {
        VectorSpace vectorSpace = new VectorSpace();
        vectorSpace.setVectorDefinition(VectorDefinition.makeRawVecDefinition());
        vectorSpace.setComparator(comparator_forTraining);
        return vectorSpace;
    }

    public void populateVectorSpace(List<EntityCodeAndNames> entityCodeAndNamesList) {
        for (EntityCodeAndNames nameAndEntityCode : entityCodeAndNamesList) {
            for (String name : nameAndEntityCode.getNameSet()) {
                addVector(nameAndEntityCode.getEntityCode(), name);
            }
        }
    }

    private void addVector(String entityCode, String name) {
        rawVs.addVector(
                entityCode, AlgorithmUtils.cleanString(name)
        );
    }

    public void train() throws Exception {
        boolean refineRefVectors = false;
        boolean averageParentCoordinatesUsingChildren = false;
        boolean relocateCoordinates_relativeToParents = true;
        boolean trainDeeperLevels = true;
        int minSizeOfVsForTrainingIt = 10;
        int numSeedingVectors = 5;
        int maxSizeOfSampledVsForRefining = 500;
        int numPassesForRefining = 10;

        // Train
        // Train
        VectorSpace orderedVs = createVectorSpace();
        this.trainedVs = hu.train_(
                orderedVs,
                rawVs,
                averageParentCoordinatesUsingChildren,
                relocateCoordinates_relativeToParents,
                trainDeeperLevels,
                minSizeOfVsForTrainingIt,
                numSeedingVectors,
                maxSizeOfSampledVsForRefining,
                numPassesForRefining,
                refineRefVectors,
                false);

        // Quickly test the search
        float testingThreshold = 0.15f;
        test_hierarchy_treeSearch.test_tree_search_batch(rawVs,
                trainedVs,
                20,
                testingThreshold,
                false,
                true,
                true);
        System.out.println("DONE");
    }

    @Override
    public void onApplicationEvent(GenericEvent event) {
        if (event.getEventType() == GenericEvent.EventType.GENERATE_VECTORS) {
            log.info("Received loader event - " + event.getEventType());
            createVectorSpace();
            populateVectorSpace(Collections.unmodifiableList((List<EntityCodeAndNames>) event.getSource()));
            try {
                train();
            } catch (Exception e) {
                e.printStackTrace();
            }
        }
    }
}
