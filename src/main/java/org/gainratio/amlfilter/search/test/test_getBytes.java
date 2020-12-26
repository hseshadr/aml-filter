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

import java.nio.charset.StandardCharsets;

public class test_getBytes {

    /**
     * @param args
     */
    public static void main(String[] args) {

        try {

            byte[] bb = new byte[25];

            //		for (int i=0; i<5; i++) {
            //			bb[i] = (byte)(i+49);
            //		}

            String stBb = "12345";
            //		String stBb = bb.toString();
            System.out.println("Cadena convertida: " + stBb);
            System.out.println("Tama�o cadena: " + stBb.length());

            //		char[] conBb = stBb.toCharArray();
            byte[] conBb = stBb.getBytes(StandardCharsets.UTF_8);
            String convCadena = new String(conBb);
            byte[] convBytesAgain = convCadena.getBytes(StandardCharsets.UTF_8);

            for (int i = 0; i < 5; i++) {
                if (bb[i] != conBb[i]) {
                    //				System.out.println("dif in position : " + i);
                    System.out.println(convBytesAgain[i]);
                }
            }

        } catch (Exception e) {
            System.out.println(e.toString());
        }


    }


}
