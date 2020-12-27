

package org.gainratio.amlfilter.search.test;

import org.gainratio.amlfilter.search.comparisonCriteria.*;
import org.gainratio.amlfilter.search.dataFiles.VectorLoader_hierarchy;
import org.gainratio.amlfilter.search.utils.VectorSpaceMetrics;
import org.gainratio.amlfilter.search.vectorSpace.*;
import org.gainratio.amlfilter.util.ObjectUtils;
import org.springframework.beans.factory.config.PropertyPlaceholderConfigurer;
import org.springframework.beans.factory.xml.XmlBeanFactory;
import org.springframework.core.io.FileSystemResource;

import java.io.BufferedWriter;
import java.io.FileOutputStream;
import java.io.OutputStreamWriter;
import java.util.List;


public final class test_hierarchy_train {

    //	private static String baseDir = "d:/data/amlfilter/teky/density_study/testing/";
    private static final String baseDir = "/opt/amlfilter/data/vs/";

    private static final Hierarchy_utils hu = new Hierarchy_utils();

    /**
     * @param args
     */
    public static void main(String[] args) throws Exception {

        // Spring loader for the beans
        XmlBeanFactory beanFactory = new XmlBeanFactory(new FileSystemResource("../amlf-engine/WEB-INF/applicationContext.xml"));
        PropertyPlaceholderConfigurer cfg = new PropertyPlaceholderConfigurer();
        cfg.setLocation(new FileSystemResource("../amlf-engine/WEB-INF/admin-config.properties"));
        cfg.postProcessBeanFactory(beanFactory);
        // Setup
        // -------------------------------------------------------------
        int numElementsToLoad = 1000;
        boolean refineRefVectors = false;
        boolean averageParentCoordinatesUsingChildren = false;
        boolean relocateCoordinates_relativeToParents = true;
        boolean trainDeeperLevels = true;
        int minSizeOfVsForTrainingIt = 10;
        String fileName = "Lista_OFAC_2008_16_10.txt";
        String fieldSeparator = "\t";//","; // "\t--\t"; //
        int fieldToLoadPosition = 1;
        int numSeedingVectors = 5;
        int maxSizeOfSampledVsForRefining = 500;
        int numPassesForRefining = 10;
        boolean enable100x100SearchTest = true;
        boolean enableThresholdTest = true;
        float thresholdForSearching = 15f;
        String noteToHeaderOfFile = "training mantaining the orphans inside.";
        // -------------------------------------------------------------

        long previousCheckPoint = System.currentTimeMillis();

        // Define the comparison criteria
        VsCriteria_Distance comparator_distance = new VsCriteria_Distance();
        VsCriteria_Distance_Normalized comparator_distNorm = new VsCriteria_Distance_Normalized();
        VsCriteria_PairSimilarity comparator_pairSim = new VsCriteria_PairSimilarity(); // comparator_pairSim
        VsCriteria_Cosine comparator_cosine = new VsCriteria_Cosine();
        VsCriteria_CompAlgs comparator_compAlgs = new VsCriteria_CompAlgs();

        VsComparisonCriteriaHandler comparator_forTraining = comparator_pairSim;

//		comparator_compAlgs.test();

        try {
            String outputFileName = System.currentTimeMillis() + "_"
                    + "treeTRAIN_"
                    + comparator_forTraining.getCriteriaName() + "_"
                    + "AP-" + averageParentCoordinatesUsingChildren + "_"
                    + "RC-" + relocateCoordinates_relativeToParents + "_"
                    + "NSV-" + numSeedingVectors + "_"
                    + "minSiz4Train-" + minSizeOfVsForTrainingIt + "_"
                    + numElementsToLoad + "-vecs";

            outputFileName = outputFileName.replaceAll(" ", "_");
            String logName = outputFileName + ".log";

            // Define VS
            VectorSpace rawVs = new VectorSpace();

            // Open the log file
            FileOutputStream f = new FileOutputStream(baseDir + logName);
            Hierarchy_utils.log = new BufferedWriter(new OutputStreamWriter(f, rawVs.getVectorManager().getLocale().getDisplayName()));

            // Write header note
            Hierarchy_utils.logLine(Hierarchy_utils.log, "### NOTE: " + noteToHeaderOfFile);

            // Set the appropriate vec definition. In this case, CSV.
//			vs.setVectorDefinition	( VectorDefinition.makeCsvVecDefinition() ); // Just for dot debugging
            rawVs.setVectorDefinition(VectorDefinition.makeRawVecDefinition());

            // Set the comparison criteria
            rawVs.setComparator(comparator_forTraining);

            VectorLoader_hierarchy.loadStringFileInVS_tiny(
                    baseDir + fileName,
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
            //VectorData target_raw = vs.createVector("the real martine");
//			VectorData target_raw = vs.createVector("Charles Armel");
            VectorData4Tree target_raw = rawVs.createVector(rawVs.get(1).getData());

            test_std_search(target_raw, rawVs, 20, 0.2f);

            Hierarchy_utils.logLine(Hierarchy_utils.log, "# Number of elements in vs: " + rawVs.size());

            // Define criteria VS
            VectorSpace orderedVs = new VectorSpace();

            // Set the appropiate vec definition. In this case, CSV.
//			criteriaVs.setVectorDefinition	( VectorDefinition.makeCsvVecDefinition() ); // Just for dot debugging
            orderedVs.setVectorDefinition(VectorDefinition.makeRawVecDefinition());

            // Set the comparison criteria
            orderedVs.setComparator(comparator_forTraining);

//			// Load the initial criteria vectors
//			VectorLoader_hierarchy.loadStringFileInVS_tiny(
//														baseDir + "criteria_names_96_trained.csv",
//														criteriaVs,
//														1,
//														"\t",
//														false,
//														5000,
//														5000000);

            checkpoint = System.currentTimeMillis();
            Hierarchy_utils.logLine(Hierarchy_utils.log, "###\n###\n### Check point timer - Loaded sample ref data: " + (checkpoint - previousCheckPoint) + " ms");
            previousCheckPoint = checkpoint;

            hu.show_refVectors(orderedVs);

            // ************ Training *****************
            // This process will:
            //	- Compute the elements that most efficiently describe the data (the centroids of the clusters of data)
            //	- Assign the children to the parent ref vectors
            //	- Recompute the children coordinates using a normalized version of the similarities (to ref vectors)   (NOTE: first version uses normalized_distance)
            //	- Recompute the ref-vectors coordinates using a normalized version of the similarities (to themselves) (NOTE: first version uses normalized_distance)
            //	- If applicable, average the ref vectors (centroids) using the data from their children, in order to make them more accurate (in R&D yet).
            //	- Recompute children max similarities to their parents, after all the "refactoring".
            // ***************************************
            // -------------------------------------------------------------
            Hierarchy_utils.logLine(Hierarchy_utils.log, "## Training...");
            orderedVs = hu.train_(
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
            // -------------------------------------------------------------
            // ***************************************
            checkpoint = System.currentTimeMillis();
            double trainingTime = ((double) (checkpoint - previousCheckPoint) / 60000d);
            Hierarchy_utils.logLine(Hierarchy_utils.log, "##### Training time: " + trainingTime + " min");
            previousCheckPoint = checkpoint;

            System.out.println("###### DONE TRAINING !");
            System.out.println();

            // Test search block (on the RAW vs)
            // -------------------------------------------------------------------------------------
            VectorData4Tree target = null;
            List<TreeResult> res = null;
            // create the target vector
            if (relocateCoordinates_relativeToParents) {

                target = orderedVs.createVector(target_raw.getData(), comparator_forTraining);
                // Search manually on the vs using the new coordinates with the standard procedure ...
                rawVs.setComparator(comparator_distNorm);
                test_std_search(target, rawVs, 50, 0.2f);
                rawVs.setComparator(comparator_distance);
                test_std_search(target, rawVs, 20, 100f);
                rawVs.setComparator(comparator_cosine);
                test_std_search(target, rawVs, 50, 0.8f);

            } else {
                target = orderedVs.createVector(target_raw.getData());
            }

            // Serialize the Vs
            // -------------------------------------------------------------------------------------
            Hierarchy_utils.logLine(Hierarchy_utils.log, "\t# Storing the vs in a file");
            System.out.println("# Storing the vs in a file");
            ObjectUtils.persistObjectToFile(orderedVs, baseDir + outputFileName + ".vs");
//			ObjectUtils.persistObjectToFile(orderedVs, baseDir + "last_trained_vs.vs");

            // This sets free all the memory for this
            // ---------------------------------------------
            orderedVs = null;
            // only get rid of the raw if not testing pending ahead
            if (!enable100x100SearchTest) {
                rawVs = null;
            }

            Hierarchy_utils.logLine(Hierarchy_utils.log, "\t# Reading the file");
            System.out.println("# Reading the file");
            VectorSpace readVs = (VectorSpace) ObjectUtils.readObjectFromFile(baseDir + outputFileName + ".vs");

            // SHOW tree
            Hierarchy_utils.logLine(Hierarchy_utils.log, "\t##### TREE ######");
            hu.show_refVectors_tree(readVs, 0);

            if (enable100x100SearchTest) {
                System.out.println("# About to search...");
//				readVs.setComparator(comparator_cosine);
                test_tree_search_batch(rawVs,
                        readVs,
                        2,
                        thresholdForSearching,
                        true,
                        true,
                        true);

                System.out.println("# Done searching");
            }

            if (enableThresholdTest) {

                float dist2Analyze = 0;
                rawVs.setComparator(readVs.getComparator());
                VectorSpaceMetrics rawVsMetrics = new VectorSpaceMetrics(rawVs);
                dist2Analyze = rawVsMetrics.getAverageSimilarity();
                dist2Analyze = (float) readVs.getComparator().getHalfWayToMaximumSimilarity(dist2Analyze);
//				dist2Analyze = (float)readVs.getComparator().getHalfWayToMinimumSimilarity(dist2Analyze);
//				dist2Analyze = (float)readVs.getComparator().getHalfWayToMinimumSimilarity(dist2Analyze);

                float th = computeThresholdForDistance(
                        rawVs,
                        readVs,
                        dist2Analyze,
                        comparator_compAlgs);

            }

            int ff = 0;

//			res = readVs.getVectorManager().recursiveTreeSearch_log(	target,
//											readVs,
//											20,
//											0.1,
//											0,
//											false);

            Hierarchy_utils.logLine(Hierarchy_utils.log, "\t# Training: " + trainingTime + " min");

            // Show the orphans
            Hierarchy_utils.logLine(Hierarchy_utils.log, "\t##### ORPHANS ######");
            hu.show_vdList(readVs.getOrphanList());


        } catch (Exception e) {
            e.printStackTrace();
            Hierarchy_utils.logLine(Hierarchy_utils.log, e.getStackTrace().toString());
        } finally {
            if (null != Hierarchy_utils.log) {
                Hierarchy_utils.log.close();
            }
        }
    }

    private static float computeThresholdForDistance(
            VectorSpace pRawVs,
            VectorSpace pTrainedVs,
            float pDistanceToUse,
            VsComparisonCriteriaHandler pComp) throws Exception {
        float retval = -1f;

        Hierarchy_utils.logLine(Hierarchy_utils.log, "## computeThresholdForDistance: " + pDistanceToUse);
        System.out.println("## computeThresholdForDistance: " + pDistanceToUse);

        for (int i = 0; i < 10; i++) {
            VectorData4Tree testVector = pRawVs.get(i);

            List<TreeResult> trl = pTrainedVs.recursiveTreeSearch(
                    testVector,
                    pRawVs.size(),
                    pDistanceToUse,
                    0,
                    false);
            double maxForThisResult = -1d;
            double minForThisResult = 1000d;

            for (int j = 0; j < trl.size(); j++) {

                double algSim = pComp.computeSimilarity(
                        testVector.getByteCoordinates(),
                        trl.get(j).getFoundVectorData().getByteCoordinates());

                if (maxForThisResult < algSim) {
                    maxForThisResult = algSim;
                }

                if (minForThisResult > algSim) {
                    minForThisResult = algSim;
                }

                Hierarchy_utils.logLine(Hierarchy_utils.log, i + " - [" + j + "] SIM: " + algSim + " ... " + testVector.getData() + " vs " + trl.get(j).getFoundVectorData().getData());
                System.out.println("\t" + i + " - [" + j + "] SIM: " + algSim + " ... " + testVector.getData() + " vs " + trl.get(j).getFoundVectorData().getData());
            }

            pRawVs.setComparator(pComp);
            List<TreeResult> algResults = pRawVs.obtainSimilarResults(testVector, pRawVs.size(), minForThisResult, false);


            System.out.println(i + " - MAX: " + maxForThisResult + "\t\tMIN: " + minForThisResult + "\t\tNUM RESULTS: " + trl.size() + "\t\t\tResults bigger than min using ALGs: " + algResults.size());
        }

        return retval;
    }

    private static void test_std_search(VectorData4Tree pTarget,
                                        VectorSpace pVs,
                                        int pMaxNumResults,
                                        float pMinSimilarityAllowed) throws Exception {

        Hierarchy_utils.logLine(Hierarchy_utils.log, "## Test search (" +
                pTarget.getData() +
                ") (sim=" +
                pMinSimilarityAllowed +
                ") ... Comparator: " +
                pVs.getComparator().getCriteriaName());

        long startTime = System.currentTimeMillis();
        List<TreeResult> results = pVs.obtainSimilarResults(pTarget, pMaxNumResults, pMinSimilarityAllowed, false);
        Hierarchy_utils.logLine(Hierarchy_utils.log, "\t# Search time (ms)= " + (System.currentTimeMillis() - startTime));
        hu.show_results(Hierarchy_utils.log, results);

    }


    private static VectorData4Tree test_tree_search_batch(
            VectorSpace pRawVs,
            VectorSpace pTrainedVs,
            int pMaxNumResults,
            float pMinSimilarityAllowed,
            boolean pShowResults,
            boolean pIgnoreOrphans,
            boolean pComputeThreshold) throws Exception {

        Hierarchy_utils.logLine(Hierarchy_utils.log, "## ! TREE BATCH test searching (" +
                pRawVs.size() +
                " elements) (sim=" +
                pMinSimilarityAllowed +
                ") ... Comparator: " +
                pTrainedVs.getComparator().getCriteriaName());

        int foundResults = 0;
        int numOfOrphansNotFound = 0;
        VectorData4Tree vectorToSearch = null;
        VectorData4Tree vectorToDebugSearchOn = null;
        List<TreeResult> results = null;
        long startTime = 0;
        long endTime = 0;
        long acumTime = 0;
        float avgTime = 0f;
        int numberOfResultsRetrievedInTotal = 0;

        for (int i = 0; i < pRawVs.size(); i++) {
            vectorToSearch = pRawVs.get(i);
            boolean found = false;
            boolean wasItOrphan = false;
            int numberOfResultsRetrievedInSingleSearch = 0;
            int numberResultsInThisBatch = 0;


            startTime = System.currentTimeMillis();
            // Searching
            // --------------------------------
            results = pTrainedVs.recursiveTreeSearch(
                    vectorToSearch,
                    pMaxNumResults,
                    pMinSimilarityAllowed,
                    0,
                    false);

            endTime = System.currentTimeMillis();
            if (i % 1000 == 0) {
                avgTime = Math.round((float) acumTime / (float) i * 100f) / 100f;
                System.out.println("...search progress: " + i + " / " + pRawVs.size() + "\t\t avg time= " + (avgTime)
                        + " ms\tTotalNumberResults= " + numberOfResultsRetrievedInTotal
                        + "\tNumberResultsInThisBatch= " + numberResultsInThisBatch);
                numberResultsInThisBatch = 0;
            }


            acumTime += (endTime - startTime);

            // Loop the results to see if the exact string was found
            for (int j = 0; j < results.size(); j++) {
                if (results.get(j).getFoundVectorData().getData().equals(vectorToSearch.getData())) {
                    foundResults++;
                    found = true;
                    break;
                } else if (pShowResults) {
//					double sim = pTrainedVs.obtainSimilarity(
//															results.get(j).getFoundVectorData(),
//															vectorToSearch);
//
//					double simOrig = pTrainedVs.obtainSimilarityUsingTrainingComparator(
//															results.get(j).getFoundVectorData(),
//															vectorToSearch);

//					System.out.println("\t-" + results.get(j).getFoundVectorData().getData() + "\t(Searching for: " + vectorToSearch.getData());
                }
            }
            numberOfResultsRetrievedInSingleSearch = results.size();
            numberResultsInThisBatch += numberOfResultsRetrievedInSingleSearch;
            numberOfResultsRetrievedInTotal += numberOfResultsRetrievedInSingleSearch;

            if (!found) {

                // check to see if the not-found-vector is part of the orphans
                for (int j = 0; j < pTrainedVs.getOrphanList().size(); j++) {
                    if (pTrainedVs.getOrphanList().get(j).getData().equals(vectorToSearch.getData())) {
                        numOfOrphansNotFound++;
                        wasItOrphan = true;
                        break;
                    }
                }

                if (wasItOrphan) {

                } else {
                    Hierarchy_utils.logLine(Hierarchy_utils.log, "\t* ERROR: " + vectorToSearch.getData() + " was not found");
                    System.out.println("\t* ERROR: " + vectorToSearch.getData() + " was not found");
//					vectorToDebugSearchOn = vectorToSearch.clone();
                }

            }
        }

        avgTime = Math.round((float) acumTime / (float) pRawVs.size() * 100f) / 100f;
        Hierarchy_utils.logLine(Hierarchy_utils.log, "\t# Total Search time (ms)= " + (acumTime) +
                "(" + avgTime + " ms/search)" +
                "\tFound: " + foundResults + " / " + pRawVs.size() + " (" + numOfOrphansNotFound + " not found orphans)"
                + " ms\tTotalNumberResults= " + numberOfResultsRetrievedInTotal);

        System.out.println("\t# Total Search time (ms)= " + (acumTime) +
                "(" + avgTime + " ms/search)" +
                "\tFound: " + foundResults + " / " + pRawVs.size() + " (" + numOfOrphansNotFound + " not found orphans)"
                + " ms\tTotalNumberResults= " + numberOfResultsRetrievedInTotal);

        return vectorToDebugSearchOn;
    }


}
