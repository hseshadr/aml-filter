/*
 * Copyright (C) 2010 AMLFilter LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package org.gainratio.amlfilter.search.test;

import org.gainratio.amlfilter.search.comparisonCriteria.VsCriteria_CompAlgs;
import org.gainratio.amlfilter.search.comparisonCriteria.VsCriteria_PairSimilarity;
import org.gainratio.amlfilter.search.vectorSpace.TreeResult;
import org.gainratio.amlfilter.search.vectorSpace.VectorData4Tree;
import org.gainratio.amlfilter.search.vectorSpace.VectorDefinition;
import org.gainratio.amlfilter.search.vectorSpace.VectorSpace;
import org.gainratio.amlfilter.util.ObjectUtils;
import org.springframework.beans.factory.config.PropertyPlaceholderConfigurer;
import org.springframework.beans.factory.xml.XmlBeanFactory;
import org.springframework.core.io.FileSystemResource;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.List;
import java.util.Random;


public class Test_ConsoleTool {

    private static final String baseDir = "D:/data/amlfilter/vs/";

    /**
     * @param args
     */
    public static void main(String[] args) {

        try {

            XmlBeanFactory beanFactory = new XmlBeanFactory(new FileSystemResource("../amlf-engine/WEB-INF/applicationContext.xml"));
            PropertyPlaceholderConfigurer cfg = new PropertyPlaceholderConfigurer();
            cfg.setLocation(new FileSystemResource("../amlf-engine/WEB-INF/admin-config.properties"));
            cfg.postProcessBeanFactory(beanFactory);

            // Define the comparison criteria
            VsCriteria_PairSimilarity comparator_pairSim = new VsCriteria_PairSimilarity();
            VsCriteria_CompAlgs comparator_compAlgs = new VsCriteria_CompAlgs();

            String fileName = "m.vs";

            VectorSpace vs = new VectorSpace();
            vs.setVectorDefinition(VectorDefinition.makeRawVecDefinition());
            // Set the comparison criteria
            vs.setOriginalComparatorWhenTraining(comparator_compAlgs);

            System.out.println("# Start time: " + new Date());
//			VectorLoader_hierarchy.loadStringFileInVS_tiny(
//												baseDir + fileName, 
//												vsFactiva, 
//												1, 
//												",", 
//												true, 
//												1000,
//												1000000);

            vs = (VectorSpace) ObjectUtils.readObjectFromFile(baseDir + fileName);

            System.out.println("# End time: " + new Date());

            String inStr = "";

            VectorData4Tree target_raw = null;
            float threshold = 5f;
            boolean performSearch = true;
            boolean vsReloaded = false;
            boolean isFlatSearchVsTreeSearchEnabled = true;

            System.out.println("Using tree search on : " + fileName);
            System.out.println("Comparator : " + vs.getOriginalComparatorWhenTraining().getCriteriaName());
            System.out.println("Using threshold : " + threshold);
            System.out.println();

            while (true) {
                try {
                    performSearch = true;
                    InputStreamReader isr = new InputStreamReader(System.in, StandardCharsets.UTF_8);
                    BufferedReader br = new BufferedReader(isr);
                    System.out.print("Enter name to search: ");
                    inStr = br.readLine().trim();

                    if (inStr != null && inStr.length() > 0 && inStr.startsWith("!")) {
                        performSearch = false;

                        if (inStr.indexOf("!LOAD") > -1) {
                            String[] tokens = inStr.split(" ");
                            String outputFileName = tokens[1];
                            System.out.println("# loading vs from file:" + outputFileName + " ...");
                            vs = (VectorSpace) ObjectUtils.readObjectFromFile(outputFileName);
                            System.out.println("# vs loaded from file. Contains: " + vs.size() + " main elements.");
                            vs.setOriginalComparatorWhenTraining(comparator_compAlgs);
                            vsReloaded = true;
                        }

                        if (inStr.indexOf("!THRESHOLD") > -1) {
                            String[] tokens = inStr.split(" ");
                            String strThreshold = tokens[1];
                            threshold = Float.parseFloat(strThreshold);
                            System.out.println("# new threshold=" + threshold);
                        }

                        if (inStr.equalsIgnoreCase("!QUIT")) {
                            break;
                        }

                        if (inStr.equalsIgnoreCase("!RND")) {
                            int rndPos = new Random().nextInt(vs.size() - 1);
                            inStr = vs.get(rndPos).getData();
                            performSearch = true;
                        }

                        if (inStr.equalsIgnoreCase("!HELP")) {

                            System.out.println("#");
                            System.out.println("# AMLF - Manual Search Tool");
                            System.out.println("# Using the vs-comparator flat search.");
                            System.out.println("#");
                            System.out.println("Commands:");
                            System.out.println("\t - !QUIT\t\t...\tExits");
                            System.out.println("\t - !RND\t\t...\tIt uses a random vector.");
                            System.out.println("\t - <name>\t\t...\tSearches for the name in both vs (direct one and cloned one.)");
                            System.out.println("\t - !HELP\t\t...\tShows this message.");
                            System.out.println("\t - !THRESHOLD <number>\t\t...\tChanges the threoshold to the specified parameter. Range: 0.0 - 1.0");
                            System.out.println("\t - !LOAD <filename>\t\t...\tLoads a vs from a serialized file.");
                            System.out.println("\t - !FLATSEARCH\t\t...\tChanges to flat-search mode.");
                            System.out.println("\t - !TREESEARCH\t\t...\tChanges to tree-search mode.");
                            System.out.println();

                        }

                        if (inStr.indexOf("!TREESEARCH") > -1) {
                            isFlatSearchVsTreeSearchEnabled = false;
                            System.out.println("# TREESEARCH ... enabled");
                        }

                        if (inStr.indexOf("!FLATSEARCH") > -1) {
                            isFlatSearchVsTreeSearchEnabled = true;
                            System.out.println("# FLATSEARCH ... enabled");
                        }

                    }

                    if (null == inStr || inStr.length() == 0) {
                        performSearch = false;
                    }

                    if (performSearch) {
                        if (vsReloaded) {
                            target_raw = vs.createVector(inStr, vs.getOriginalComparatorWhenTraining());
                        } else {
                            target_raw = vs.createVector(inStr);
                        }
                        test_std_search(target_raw, vs, 20, threshold, isFlatSearchVsTreeSearchEnabled);
                        //					test_std_search(target_raw, rawVsFactiva02, 20, threshold);
                    }
                } catch (Exception e) {
                    e.printStackTrace();
                }
            } // end of while

        } catch (Exception e) {
            e.printStackTrace();
        }

    }

    private static void test_std_search(VectorData4Tree pTarget,
                                        VectorSpace pVs,
                                        int pMaxNumResults,
                                        float pMinSimilarityAllowed,
                                        boolean pIsFlatSearchVsTreeSearchEnabled) throws Exception {

        System.out.println("## Test search (" +
                pTarget.getData() +
                ") (sim=" +
                pMinSimilarityAllowed +
                ") ... Comparator: " +
                pVs.getComparator().getCriteriaName());

        long startTime = System.currentTimeMillis();
        List<TreeResult> results = null;
        if (pIsFlatSearchVsTreeSearchEnabled) {
            results = pVs.obtainSimilarResults(pTarget, pMaxNumResults, pMinSimilarityAllowed, false);
        } else {
            results = pVs.recursiveTreeSearch(pTarget, pMaxNumResults, pMinSimilarityAllowed, 0, false);
        }
        System.out.println("\t# Search time (ms)= " + (System.currentTimeMillis() - startTime));

        for (int i = 0; i < results.size(); i++) {
            System.out.println("\t- " + results.get(i).getFoundVectorData().getData() + "\tSim:" + results.get(i).getSearchName());
        }

    }

}
