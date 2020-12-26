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

package org.gainratio.amlfilter.search.dataFiles;

import org.gainratio.amlfilter.search.vectorSpace.VectorData4Tree;
import org.gainratio.amlfilter.search.vectorSpace.VectorDefinition;
import org.gainratio.amlfilter.search.vectorSpace.VectorManager;
import org.gainratio.amlfilter.search.vectorSpace.VectorSpace;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.FileReader;
import java.nio.charset.StandardCharsets;


public class VectorLoader_tiny {

    final static int LIMIT_ABS_VAL = 1000;

    public static VectorSpace loadDataFileInVS_bytes(String pFileName, VectorSpace pVs) throws Exception {
        //List<VectorData> vectorSpace = new ArrayList<VectorData>();
        File f = new File(pFileName);
        String line = null;
        String[] tokens = null; // valores
        String[] t1 = null;
        byte tempVal = 0;
        int count = 0;
        int firstLineTokens = 0;

        VectorManager vecMan = new VectorManager();

        VectorDefinition vecDef = VectorDefinition.makeRawVecDefinition();

        System.out.println("- loadDataFileInVS. Archivo a leer: " + pFileName);

        BufferedReader input = null;

        try {
            input = new BufferedReader(new FileReader(f));

            while ((line = input.readLine()) != null) {
                count++;
                t1 = line.split(":");
                VectorData4Tree vector = new VectorData4Tree();
                tokens = t1[1].split(",");

                // comprobar que todas las lineas tienen los mismos tokens
                if (count == 1) {
                    firstLineTokens = tokens.length;
                } else {
                    if (firstLineTokens != tokens.length) {
                        System.out.println("*** Error in the number of tokens. Expected: " + firstLineTokens + "  found: " + tokens.length + "  Line: " + count);
                        return null;
                    }
                }
                byte[] dataBytes = new byte[firstLineTokens - 1];

                int elementos = tokens.length;

                // Saltamos el primer token (el �ndice) y el �ltimo (la clasificaci�n) NOTA: el primero se salta en la primera tokenizacion
                for (int i = 0; i < elementos - 1; i++) {

                    tempVal = (byte) Integer.parseInt(tokens[i].trim());

                    dataBytes[i] = tempVal;

                }

                vector = vecMan.createVector(vecDef, dataBytes);
                vector.setData(new String(tokens[elementos - 1].getBytes(), StandardCharsets.UTF_8)); // + " pos: " + new String(tokens[0]));

                pVs.getVectorList().add(vector);

                if ((count % 10000) == 0) {
                    System.out.println("Read: " + count);
                }

            }

            input.close();
        } catch (FileNotFoundException e) {
            System.out.println("*** Error: file not found");

            return null;
        } catch (Exception e) {
            System.out.println(e.toString());

            return null;
        }


        System.out.println("- loadDataFileInVS. Exit ok.");

        return pVs;
    }


    /**
     * This method loads a data file composed by strings into a vector space.
     * For creating the vectors, it uses the vector manager of the provided vs.
     * <p>
     * NOTE: it deletes the previous vectors that come with the vs.
     * <p>
     * File Format:
     * - Records separated by lines.
     * - Each record has: id <tab> string <tab> category
     * - Char-set = UTF-8
     *
     * @param pFileName The path and name of the file to load
     * @param pVs       The vector space where to load the vectors.
     * @return The vector space
     */
    public static VectorSpace loadStringFileInVS_tiny(String pFileName,
                                                      VectorSpace pVs,
                                                      int pFieldPosition,
                                                      String pFieldSeparator,
                                                      boolean pFlexibleOnNumberOfFields,
                                                      int pProgressIndicatorStepping) {
        String methodSignature = "loadStringFileInVS_tiny" + " : ";

        File f = new File(pFileName);
        String line = null;
        String[] tokens = null;
        int count = 0;
        int previousLineTokens = -1;

        System.out.println("# " + methodSignature + " Archivo a leer: " + pFileName);

        BufferedReader input = null;

        try {
            input = new BufferedReader(new FileReader(f));

            while ((line = input.readLine()) != null) {
                // Getting the fields
                tokens = line.split(pFieldSeparator);

                // Checking that the lines have the same amount of fields.
                if (count > 0) {
                    if (previousLineTokens != tokens.length && !pFlexibleOnNumberOfFields) {
                        System.out.println(methodSignature + " Line " + count + 1 + " has different amount of fields than the previos one (previous had " + previousLineTokens + " fields).");
                        return null;
                    }
                }
                previousLineTokens = tokens.length;


                // Checking that the line has enough fields
                if (tokens.length < pFieldPosition + 1) {
                    System.out.println(methodSignature + " Line " + count + 1 + " has less amount of fields than the needed ones: " + pFieldPosition);
                    return null;
                }

                // Adding the item to the vs
                pVs.addVector(tokens[pFieldPosition]);

                count++;

                // Showing progress
                if (pProgressIndicatorStepping > 0 && (count % pProgressIndicatorStepping) == 0) {
                    System.out.println("\t ... read progress: " + count);
                }
            }

            input.close();
        } catch (FileNotFoundException e) {
            System.out.println("*** " + methodSignature + " Error: file not found:" + pFileName);

            return null;
        } catch (Exception e) {
            System.out.println(e.toString());

            return null;
        }


        System.out.println("# (" + methodSignature + ") correctly read " + count + " records. Last record has " + previousLineTokens + " fields. \n\t\tBeing flexible on field number: " + pFlexibleOnNumberOfFields);

        return pVs;
    }


    private static boolean isFloat(String str) {
        try {
            String tmpStr = str.trim().replace(".", "").replace("+", "");

            return isInteger(tmpStr);
        } catch (NumberFormatException nfe) {
            return false;
        }
    }

    private static boolean isInteger(String str) {
        try {
            Integer.parseInt(str.trim());

            return true;
        } catch (NumberFormatException nfe) {
            return false;
        }
    }

}
