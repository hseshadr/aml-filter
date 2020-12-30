package org.gainratio.amlfilter.vector.test;

import org.gainratio.amlfilter.vector.comparisonCriteria.*;
import org.gainratio.amlfilter.vector.dataFiles.VectorLoader_hierarchy;
import org.gainratio.amlfilter.vector.utils.VectorSpaceMetrics;
import org.gainratio.amlfilter.vector.vectorSpace.Hierarchy_utils;
import org.gainratio.amlfilter.vector.vectorSpace.VectorDefinition;
import org.gainratio.amlfilter.vector.vectorSpace.VectorSpace;


public class test_Comparators {

    // Define the comparison criteria
    static VsCriteria_Distance comparator_distance = new VsCriteria_Distance();
    static VsCriteria_Distance_Normalized comparator_distNorm = new VsCriteria_Distance_Normalized();
    static VsCriteria_PairSimilarity comparator_pairSim = new VsCriteria_PairSimilarity();
    static VsCriteria_Cosine comparator_cosine = new VsCriteria_Cosine();
    static VsCriteria_Cosine_full comparator_cosine_full = new VsCriteria_Cosine_full();
    static VsCriteria_CompAlgs comparator_compAlg = new VsCriteria_CompAlgs();

    /**
     * @param args
     */
    public static void main(String[] args) {

        try {
            // Define VS
            VectorSpace rawVs = new VectorSpace();

            // Set the appropriate vec definition. In this case, CSV.
            rawVs.setVectorDefinition(VectorDefinition.makeRawVecDefinition());

            // Set the initial comparison criteria
            rawVs.setComparator(comparator_pairSim);

            String baseDir = "/opt/amlfilter/data/";
            String fileName = "number.txt";
            int numElementsToLoad = 1000;

            VectorLoader_hierarchy.loadStringFileInVS_tiny(
                    baseDir + fileName,
                    rawVs,
                    1,
                    "\t--\t",
                    true,
                    500,
                    numElementsToLoad);

            System.out.println("# Number of elements in vs: " + rawVs.size());

            // Define criteria VS
            VectorSpace orderedVs = new VectorSpace();

            // Set the appropriate vector definition. In this case, CSV.
            orderedVs.setVectorDefinition(VectorDefinition.makeRawVecDefinition());

            // Set the initial comparison criteria
            orderedVs.setComparator(comparator_pairSim);

            VectorSpaceMetrics rawVsMetrics = new VectorSpaceMetrics(rawVs);

            System.out.println(rawVsMetrics.toString());


            double v1 = 0.6d;
            double v2 = 0.2d;


            show_behaviour(v1, v2);
            show_behaviour(0.1d, 0.7d);
            show_behaviour(0.6d, 0.7d);

        } catch (Exception e) {
            e.printStackTrace();
            Hierarchy_utils.logLine(Hierarchy_utils.log, e.getStackTrace().toString());
        }

    }

    private static void show_behaviour(double v1, double v2) {
        VsComparisonCriteriaHandler comp = null;

        comp = comparator_distance;
        System.out.println("#########" + comp.getCriteriaName());
        System.out.println("Max value= " + comp.getMaxSimilarityValue());
        System.out.println("Min value= " + comp.getMinSimilarityValue());
        double resultado = comp.incSim_ReduceSeparation(v1, v2);
        System.out.println(v1 + " + " + v2 + " = " + resultado);
        resultado = comp.redSim_IncreaseSeparation(v1, v2);
        System.out.println(v1 + " - " + v2 + " = " + resultado);
        System.out.println("getHalfWayToMaximumSimilarity(" + v1 + ") = " + comp.getHalfWayToMaximumSimilarity(v1));
        System.out.println("getHalfWayToMinimumSimilarity(" + v1 + ") = " + comp.getHalfWayToMinimumSimilarity(v1));

        comp = comparator_distNorm;
        System.out.println("#########" + comp.getCriteriaName());
        System.out.println("Max value= " + comp.getMaxSimilarityValue());
        System.out.println("Min value= " + comp.getMinSimilarityValue());
        resultado = comp.incSim_ReduceSeparation(v1, v2);
        System.out.println(v1 + " + " + v2 + " = " + resultado);
        resultado = comp.redSim_IncreaseSeparation(v1, v2);
        System.out.println(v1 + " - " + v2 + " = " + resultado);
        System.out.println("getHalfWayToMaximumSimilarity(" + v1 + ") = " + comp.getHalfWayToMaximumSimilarity(v1));
        System.out.println("getHalfWayToMinimumSimilarity(" + v1 + ") = " + comp.getHalfWayToMinimumSimilarity(v1));

        comp = comparator_pairSim;
        System.out.println("#########" + comp.getCriteriaName());
        System.out.println("Max value= " + comp.getMaxSimilarityValue());
        System.out.println("Min value= " + comp.getMinSimilarityValue());
        resultado = comp.incSim_ReduceSeparation(v1, v2);
        System.out.println(v1 + " + " + v2 + " = " + resultado);
        resultado = comp.redSim_IncreaseSeparation(v1, v2);
        System.out.println(v1 + " - " + v2 + " = " + resultado);
        System.out.println("getHalfWayToMaximumSimilarity(" + v1 + ") = " + comp.getHalfWayToMaximumSimilarity(v1));
        System.out.println("getHalfWayToMinimumSimilarity(" + v1 + ") = " + comp.getHalfWayToMinimumSimilarity(v1));

        comp = comparator_cosine;
        System.out.println("#########" + comp.getCriteriaName());
        System.out.println("Max value= " + comp.getMaxSimilarityValue());
        System.out.println("Min value= " + comp.getMinSimilarityValue());
        resultado = comp.incSim_ReduceSeparation(v1, v2);
        System.out.println(v1 + " + " + v2 + " = " + resultado);
        resultado = comp.redSim_IncreaseSeparation(v1, v2);
        System.out.println(v1 + " - " + v2 + " = " + resultado);
        System.out.println("getHalfWayToMaximumSimilarity(" + v1 + ") = " + comp.getHalfWayToMaximumSimilarity(v1));
        System.out.println("getHalfWayToMinimumSimilarity(" + v1 + ") = " + comp.getHalfWayToMinimumSimilarity(v1));

        comp = comparator_cosine_full;
        System.out.println("#########" + comp.getCriteriaName());
        System.out.println("Max value= " + comp.getMaxSimilarityValue());
        System.out.println("Min value= " + comp.getMinSimilarityValue());
        resultado = comp.incSim_ReduceSeparation(v1, v2);
        System.out.println(v1 + " + " + v2 + " = " + resultado);
        resultado = comp.redSim_IncreaseSeparation(v1, v2);
        System.out.println(v1 + " - " + v2 + " = " + resultado);
        System.out.println("getHalfWayToMaximumSimilarity(" + v1 + ") = " + comp.getHalfWayToMaximumSimilarity(v1));
        System.out.println("getHalfWayToMinimumSimilarity(" + v1 + ") = " + comp.getHalfWayToMinimumSimilarity(v1));

        comp = comparator_compAlg;
        System.out.println("#########" + comp.getCriteriaName());
        System.out.println("Max value= " + comp.getMaxSimilarityValue());
        System.out.println("Min value= " + comp.getMinSimilarityValue());
        resultado = comp.incSim_ReduceSeparation(v1, v2);
        System.out.println(v1 + " + " + v2 + " = " + resultado);
        resultado = comp.redSim_IncreaseSeparation(v1, v2);
        System.out.println(v1 + " - " + v2 + " = " + resultado);
        System.out.println("getHalfWayToMaximumSimilarity(" + v1 + ") = " + comp.getHalfWayToMaximumSimilarity(v1));
        System.out.println("getHalfWayToMinimumSimilarity(" + v1 + ") = " + comp.getHalfWayToMinimumSimilarity(v1));
    }

}
