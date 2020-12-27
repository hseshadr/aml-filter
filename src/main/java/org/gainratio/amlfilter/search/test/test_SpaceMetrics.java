

package org.gainratio.amlfilter.search.test;

import org.gainratio.amlfilter.search.comparisonCriteria.VsCriteria_Cosine;
import org.gainratio.amlfilter.search.comparisonCriteria.VsCriteria_Distance;
import org.gainratio.amlfilter.search.comparisonCriteria.VsCriteria_Distance_Normalized;
import org.gainratio.amlfilter.search.comparisonCriteria.VsCriteria_PairSimilarity;
import org.gainratio.amlfilter.search.dataFiles.VectorLoader_hierarchy;
import org.gainratio.amlfilter.search.utils.VectorSpaceMetrics;
import org.gainratio.amlfilter.search.vectorSpace.VectorDefinition;
import org.gainratio.amlfilter.search.vectorSpace.VectorSpace;


public final class test_SpaceMetrics {

    private static final String baseDir = "/opt/amlfilter/data/";

    /**
     * @param args
     */
    public static void main(String[] args) throws Exception {

        // Setup
        // -------------------------------------------------------------
        int numElementsToLoad = 50000;
        String fileName = "_blacklist2.dat";
        // -------------------------------------------------------------

        // Define the comparison criteria
        VsCriteria_Distance comparator_distance = new VsCriteria_Distance();
        VsCriteria_Distance_Normalized comparator_distNorm = new VsCriteria_Distance_Normalized();
        VsCriteria_PairSimilarity comparator_pairSim = new VsCriteria_PairSimilarity();
        VsCriteria_Cosine comparator_cosine = new VsCriteria_Cosine();

        try {
            // Define VS
            VectorSpace rawVs = new VectorSpace();

            // Set the appropriate vec definition. In this case, CSV.
//			vs.setVectorDefinition	( VectorDefinition.makeCsvVecDefinition() ); // Just for dot debugging
            rawVs.setVectorDefinition(VectorDefinition.makeRawVecDefinition());

            // Set the comparison criteria
            rawVs.setComparator(comparator_pairSim);


            numElementsToLoad = 1000;

            VectorLoader_hierarchy.loadStringFileInVS_tiny(
                    baseDir + fileName,
                    rawVs,
                    1,
                    ",", //"\t--\t",
                    true,
                    500,
                    numElementsToLoad);


            rawVs.markAllVectorsInList();
            long previousCheckPoint = System.currentTimeMillis();
            // Compute the metrics to get the average distance in the space
            VectorSpaceMetrics rawVsMetrics = new VectorSpaceMetrics(rawVs);
            long checkpoint = System.currentTimeMillis();
            System.out.println("### Computing metrics time: " + (checkpoint - previousCheckPoint) + " ms");
            System.out.println("## Vs size = " + rawVs.size());
            System.out.println("## getAverageSimilarity = " + rawVsMetrics.getAverageSimilarity());
            System.out.println("## getMaxPossibleSimilarityDifference = " + rawVsMetrics.getMaxPossibleSimilarityDifference());
            System.out.println("## getNumDimensions = " + rawVsMetrics.getNumDimensions());


            numElementsToLoad = 10000;

            VectorLoader_hierarchy.loadStringFileInVS_tiny(
                    baseDir + fileName,
                    rawVs,
                    1,
                    ",", //"\t--\t",
                    true,
                    500,
                    numElementsToLoad);


            rawVs.markAllVectorsInList();
            previousCheckPoint = System.currentTimeMillis();
            // Compute the metrics to get the average distance in the space
            rawVsMetrics = new VectorSpaceMetrics(rawVs);
            checkpoint = System.currentTimeMillis();
            System.out.println("### Computing metrics time: " + (checkpoint - previousCheckPoint) + " ms");
            System.out.println("## Vs size = " + rawVs.size());
            System.out.println("## getAverageSimilarity = " + rawVsMetrics.getAverageSimilarity());
            System.out.println("## getMaxPossibleSimilarityDifference = " + rawVsMetrics.getMaxPossibleSimilarityDifference());
            System.out.println("## getNumDimensions = " + rawVsMetrics.getNumDimensions());


        } catch (Exception e) {
            e.printStackTrace();
        }
    }


}
