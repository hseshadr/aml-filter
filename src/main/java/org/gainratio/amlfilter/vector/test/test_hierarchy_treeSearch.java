package org.gainratio.amlfilter.vector.test;

import org.gainratio.amlfilter.util.ObjectUtils;
import org.gainratio.amlfilter.vector.comparisonCriteria.*;
import org.gainratio.amlfilter.vector.dataFiles.VectorLoader_hierarchy;
import org.gainratio.amlfilter.vector.vectorSpace.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.config.PropertyPlaceholderConfigurer;
import org.springframework.beans.factory.xml.XmlBeanFactory;
import org.springframework.core.io.FileSystemResource;

import java.io.BufferedWriter;
import java.io.FileOutputStream;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Random;


public final class test_hierarchy_treeSearch {
    private static final Logger logger = LoggerFactory.getLogger(test_hierarchy_treeSearch.class);

    private static final String baseDir = "/opt/amlfilter/data/vs/";

    private static final Hierarchy_utils hu = new Hierarchy_utils();

    /**
     * @param args
     */
    public static void main(String[] args) throws Exception {

        // Spring loader for the beans
        XmlBeanFactory beanFactory = new XmlBeanFactory(new FileSystemResource("../amlf-engine/WEB-INF/applicationContext.xml"));
        PropertyPlaceholderConfigurer cfg = new PropertyPlaceholderConfigurer();
        cfg.setLocation(new FileSystemResource("../amlf-engine/WEB-INF/batch_82_445.admin-config.properties"));
        cfg.postProcessBeanFactory(beanFactory);

        // Setup
        // -------------------------------------------------------------
        int numElementsToLoad = 50;
        boolean averageParentCoordinatesUsingChildren = false;
        boolean relocateCoordinates_relativeToParents = true;
        boolean trainDeeperLevels = true;
        int minSizeOfVsForTrainingIt = 10;
        String rawFileName = "test.txt";
        String vsFileName = "mnm.vs";
        String fieldSeparator = "\t--\t"; // ","; //
        int fieldToLoadPosition = 1;
        float testingThreshold = 0.1f;
        // -------------------------------------------------------------

        long previousCheckPoint = System.currentTimeMillis();

        // Define the comparison criteria
        VsCriteria_Distance comparator_distance = new VsCriteria_Distance();
        VsCriteria_Distance_Normalized comparator_distNorm = new VsCriteria_Distance_Normalized();
        VsCriteria_PairSimilarity comparator_pairSim = new VsCriteria_PairSimilarity();
        VsCriteria_Cosine comparator_cosine = new VsCriteria_Cosine();
        VsCriteria_CompAlgs comparator_compAlgs = new VsCriteria_CompAlgs();

        VsComparisonCriteriaHandler comparator_for_searching = comparator_compAlgs;

        try {
            String outputFileName = System.currentTimeMillis() + "_"
                    + "treeSEARCH_"
                    + comparator_for_searching.getCriteriaName() + "_"
                    + "avgPar-" + averageParentCoordinatesUsingChildren + "_"
                    + "relocCoord-" + relocateCoordinates_relativeToParents + "_"
                    + "trainDeep-" + trainDeeperLevels + "_"
                    + "minSiz4Train-" + minSizeOfVsForTrainingIt + "_"
                    + numElementsToLoad + "-vecs";

//			outputFileName = outputFileName.replaceAll(" ", "_");
            String logName = outputFileName + ".log";

            // Define VS
            VectorSpace rawVs = new VectorSpace();

            // Open the log file
            FileOutputStream f = new FileOutputStream(baseDir + logName);
            Hierarchy_utils.log = new BufferedWriter(new OutputStreamWriter(f, rawVs.getVectorManager().getLocale().getDisplayName()));

            // Set the appropriate vec definition. In this case, CSV.
//			vs.setVectorDefinition	( VectorDefinition.makeCsvVecDefinition() ); // Just for dot debugging
            rawVs.setVectorDefinition(VectorDefinition.makeRawVecDefinition());

            // Set the comparison criteria
            rawVs.setComparator(comparator_for_searching);

            VectorLoader_hierarchy.loadStringFileInVS_tiny(
                    baseDir + rawFileName,
                    rawVs,
                    fieldToLoadPosition,
                    fieldSeparator,
                    true,
                    500,
                    numElementsToLoad);

            // sample the vs. this allows different sets for testing every time
            //rawVs.setVectorList( Sampling.buildRandomSample(rawVs, 1000, false, false) );

            long checkpoint = System.currentTimeMillis();
            Hierarchy_utils.logLine(Hierarchy_utils.log, "###\n###\n### Check point timer - Loaded world of data: " + (checkpoint - previousCheckPoint) + " ms");
            previousCheckPoint = checkpoint;

            // Searching manually using pair similarity
            VectorData target_raw = rawVs.createVector(rawVs.get(1).getData());

            test_std_search(target_raw, rawVs, 20, 0.2f);

            Hierarchy_utils.logLine(Hierarchy_utils.log, "# Number of elements in vs: " + rawVs.size());

            // Define criteria VS
            VectorSpace orderedVs = new VectorSpace();

            logger.info("# About to search...");


            // de-Serialize the Vs
            // -------------------------------------------------------------------------------------
            Hierarchy_utils.logLine(Hierarchy_utils.log, "\t# Reading the file");
            String fileWithVs = baseDir + vsFileName;
            VectorSpace readVs = (VectorSpace) ObjectUtils.readObjectFromFile(fileWithVs);

            // Reseting the comp alg
            readVs.setOriginalComparatorWhenTraining(comparator_for_searching);

            // Test search block (on the persisted vs)
            // -------------------------------------------------------------------------------------

            // SHOW tree
            Hierarchy_utils.logLine(Hierarchy_utils.log, "\t##### TREE ######");
            hu.show_refVectors_tree(orderedVs, 0);

            test_tree_search_batch(rawVs,
                    readVs,
                    2,
                    testingThreshold,
                    false,
                    true,
                    true);


            logger.info("# Done searching");
//			Hierarchy_utils.logLine(Hierarchy_utils.log,"\t# Training: " + trainingTime + " min");

            // Show the orphans
            Hierarchy_utils.logLine(Hierarchy_utils.log, "\t##### ORPHANS ######");
            hu.show_vdList(orderedVs.getOrphanList());

            // manual search

            VectorData v2s = readVs.createVector("ROBERT GABRIEL MUGABE", readVs.getOriginalComparatorWhenTraining());
            List<TreeResult> res = readVs.recursiveTreeSearch(
                    v2s,
                    50,
                    25,
                    0,
                    false);

            logger.info("########## Coordinates:");
            for (int i = 0; i < v2s.getByteCoordinates().length; i++) {
                System.out.print(v2s.getByteCoordinates()[i] + ",");
            }

            Hierarchy_utils.logLine(Hierarchy_utils.log, "########### MANUAL TEST : " + v2s.getData());
            hu.show_results(Hierarchy_utils.log, res);

//			Hierarchy_utils.logLine(Hierarchy_utils.log,"########### MANUAL TEST : " + v2s.getData());
//			target = orderedVs.createVector("", comparator_forTraining);
//			thresholdAdjustmentTest(target, orderedVs, rawVs, hu, searchDistance);


        } catch (Exception e) {
            e.printStackTrace();
            Hierarchy_utils.logLine(Hierarchy_utils.log, e.getStackTrace().toString());
        } finally {
            if (null != Hierarchy_utils.log) {
                Hierarchy_utils.log.close();
            }
        }
    }


    private static void test_std_search(VectorData pTarget,
                                        VectorSpace pVs,
                                        int pMaxNumResults,
                                        float pMinSimilarityAllowed) throws Exception {

        Hierarchy_utils.logLine(Hierarchy_utils.log, "## Test search (" +
                pTarget.getData() +
                ") (sim=" +
                pMinSimilarityAllowed +
                ") ... Comparator: " +
                pVs.getComparator().getCriteriaName() + "\tTHR.: " + pMinSimilarityAllowed);

        long startTime = System.currentTimeMillis();
        List<TreeResult> results = pVs.obtainSimilarResults(pTarget, pMaxNumResults, pMinSimilarityAllowed, false);
        Hierarchy_utils.logLine(Hierarchy_utils.log, "\t# Search time (ms)= " + (System.currentTimeMillis() - startTime));
        hu.show_results(Hierarchy_utils.log, results);

    }


    public static VectorData test_tree_search_batch(
            VectorSpace pRawVs,
            VectorSpace pTrainedVs,
            int pMaxNumResults,
            float pMinSimilarityAllowed,
            boolean pShowResults,
            boolean pIgnoreOrphans,
            boolean pUseNewMethod) throws Exception {

        Hierarchy_utils.logLine(Hierarchy_utils.log, "## ! TREE BATCH test searching (" +
                pRawVs.size() +
                " elements) (sim=" +
                pMinSimilarityAllowed +
                ") ... Comparator: " +
                pTrainedVs.getComparator().getCriteriaName());
        if (pUseNewMethod) {
            Hierarchy_utils.logLine(Hierarchy_utils.log, "## NEW method");
        } else {
            Hierarchy_utils.logLine(Hierarchy_utils.log, "## old METHOD");
        }

        int foundResults = 0;
        int numOfOrphansNotFound = 0;
        VectorData vectorToSearch = null;
        VectorData vectorToDebugSearchOn = null;
        List<TreeResult> results = null;
        long startTime = 0;
        long endTime = 0;
        long acumTime = 0;
        float avgTime = 0f;

        int counter = 0;
        int numSearches = 0;
        boolean justTestOnePercent = true;
        int randomMask = Math.abs((new Random()).nextInt()%100);
        logger.info("randomMask: {}",randomMask);
        for (int i = 0; i < pRawVs.size(); i++) {
            counter++;
            // Skips checking 99% of the times...
            if (justTestOnePercent && counter%100!=randomMask) continue;

            vectorToSearch = pRawVs.get(i);
            VectorData vectorToSearchTranslated = null;
            boolean found = false;
            boolean wasItOrphan = false;

            if (pUseNewMethod) {
                startTime = System.currentTimeMillis();

                vectorToSearchTranslated
                        = pTrainedVs.createVector(
                        pRawVs.get(i).getData(),
                        pTrainedVs.getOriginalComparatorWhenTraining());

                // Searching
                // --------------------------------
                results = pTrainedVs.recursiveTreeSearch(
                        vectorToSearchTranslated,
                        pMaxNumResults,
                        pMinSimilarityAllowed,
                        0,
                        false);
                endTime = System.currentTimeMillis();
                if (i % 1000 == 0) {
                    avgTime = Math.round((float) acumTime / (float) i * 100f) / 100f;
                    logger.info("...search progress: " + i + " / " + pRawVs.size() + "\t\t avg time= " + (avgTime) + " ms");
                }
            } else {
                startTime = System.currentTimeMillis();
                results = pTrainedVs.treeSearch_old(
                        vectorToSearch,
                        pMaxNumResults,
                        pMinSimilarityAllowed,
                        false);
                endTime = System.currentTimeMillis();
            }
            acumTime += (endTime - startTime);
            numSearches++;

            // Loop the results to see if the exact string was found
            for (int j = 0; j < results.size(); j++) {
                if (results.get(j).getFoundVectorData().getData().equals(vectorToSearch.getData())) {
                    foundResults++;
                    found = true;
                    break;
                }
            }

            if (!found) {

                // check to see if the not-found-vector is part of the orphans
                for (int j = 0; j < pTrainedVs.getOrphanList().size(); j++) {
                    if (pTrainedVs.getOrphanList().get(j).getData().equals(vectorToSearch.getData())) {
                        numOfOrphansNotFound++;
                        wasItOrphan = true;
                        break;
                    }
                }

                if (pIgnoreOrphans && wasItOrphan) {

                } else {
                    Hierarchy_utils.logLine(Hierarchy_utils.log, "\t* ERROR: " + vectorToSearch.getData() + " was not found");
                    vectorToDebugSearchOn = vectorToSearch.clone();
                }
            }
        }

        avgTime = Math.round((float) acumTime / (float) numSearches * 100f) / 100f;
        String msg = "\n\t# Total Search time (ms)= " + (acumTime) +
                "(" + avgTime + " ms/search)" +
                "\tFound: " + foundResults + " / " + numSearches + " (" + numOfOrphansNotFound + " not found orphans)";
        Hierarchy_utils.logLine(Hierarchy_utils.log, msg);
        logger.info(msg);

        // Debugging vector creation
        String name = new String("BEN LADEN OSSAMA".getBytes(StandardCharsets.UTF_8), StandardCharsets.UTF_8);
        VectorData vector2Search = pTrainedVs.createVector(
                name,
                pTrainedVs.getOriginalComparatorWhenTraining());
        System.out.println();
        System.out.print("# name: " + name + "\tCoord.: ");
        for (int i = 0; i < vector2Search.getByteCoordinates().length; i++) {
            System.out.print(vector2Search.getByteCoordinates()[i] + ", ");
        }
        System.out.println();

        // Debugging seeding vectors
        logger.info("# Seeding vectors");
        for (int i = 0; i < pTrainedVs.getByteArraySeedingList().size(); i++) {
            logger.info("\t-" + new String(pTrainedVs.getByteArraySeedingList().get(i)));
        }

        // Debugging algorithm components and weights
        logger.info("# algorithm components");
        String critName = pTrainedVs.getOriginalComparatorWhenTraining().getCriteriaName();
        logger.info("critName : " + critName);

        return vectorToDebugSearchOn;
    }


}
