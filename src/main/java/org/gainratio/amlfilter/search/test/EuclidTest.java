package org.gainratio.amlfilter.search.test;

import org.gainratio.amlfilter.search.utils.VectorUtils;
import org.gainratio.amlfilter.search.vectorSpace.Hierarchy_utils;


public class EuclidTest {

    private static final String CHARS_FOR_SEADING = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

    /**
     * @param args
     */
    public static void main(String[] args) throws Exception {
        String strA = "A  BBBB   ";
        String strB = "   BB  ";
        String strC = "   BBB ";

        byte[] vA = Hierarchy_utils.getRigidCoordinates(strA);
        byte[] vB = Hierarchy_utils.getRigidCoordinates(strB);
        byte[] vC = Hierarchy_utils.getRigidCoordinates(strC);

        double distAB = VectorUtils.computeDistanceOfVectors(vA, vB);
        double distBC = VectorUtils.computeDistanceOfVectors(vB, vC);
        double distAC = VectorUtils.computeDistanceOfVectors(vA, vC);

        System.out.println("distAB = " + distAB);
        System.out.println("distBC = " + distBC);
        System.out.println("distAC = " + distAC);

        boolean isEuclidCompliant = false;
        if (distAB + distBC >= distAC) {
            isEuclidCompliant = true;
        }

        System.out.println("isEuclidCompliant = " + isEuclidCompliant);

        System.out.println("\n# Running brute force...");

        runBruteForceTest();

        System.out.println("\n# Done!");

    }

    private static void runBruteForceTest() throws Exception {

        boolean isEuclidCompliant = true;

        String strA = null;
        String strB = null;
        String strC = null;

        byte[] vA = null;
        byte[] vB = null;
        byte[] vC = null;

        double distAB = 0d;
        double distBC = 0d;
        double distAC = 0d;

        int maxIterations = 10000000;
        int count = 0;

        while (isEuclidCompliant && count < maxIterations) {
            isEuclidCompliant = false;

            strA = buildRandomString();
            strB = buildRandomString();
            strC = buildRandomString();

            vA = Hierarchy_utils.getRigidCoordinates(strA);
            vB = Hierarchy_utils.getRigidCoordinates(strB);
            vC = Hierarchy_utils.getRigidCoordinates(strC);

            distAB = VectorUtils.computeDistanceOfVectors(vA, vB);
            distBC = VectorUtils.computeDistanceOfVectors(vB, vC);
            distAC = VectorUtils.computeDistanceOfVectors(vA, vC);


            if (distAB + distBC >= distAC) {
                isEuclidCompliant = true;
            }

            count++;

            if (count % 100000 == 0) {
                System.out.println("\tprogress: " + count);
            }
        }

        if (!isEuclidCompliant) {
            System.out.println("strA = " + strA);
            System.out.println("strB = " + strB);
            System.out.println("strC = " + strC);

            System.out.println("distAB = " + distAB);
            System.out.println("distBC = " + distBC);
            System.out.println("distAC = " + distAC);
        } else {
            System.out.println("\n# Looks euclidean.");
        }


    }

    private static String buildRandomString() {
        StringBuilder retString = new StringBuilder();

        int strLen = (int) (Math.random() * 50);
        int charPos = 0;
        int seedCharLen = CHARS_FOR_SEADING.length();

        for (int i = 0; i < strLen; i++) {
            charPos = (int) (Math.random() * seedCharLen);
            retString.append(CHARS_FOR_SEADING.charAt(charPos));

            // Spaces ?
            if (Math.random() * 10 > 8) {
                retString.append(" ");
            }
        }

        return retString.toString();
    }

}




























