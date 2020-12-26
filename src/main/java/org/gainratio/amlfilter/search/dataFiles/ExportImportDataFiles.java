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

import org.gainratio.amlfilter.search.vectorSpace.VectorSpace;

import java.io.BufferedWriter;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStreamWriter;


public class ExportImportDataFiles {

    private static final String INNER_FIELD_SEPARATOR = ",";

    public static void exportVs(VectorSpace pVs, String pFileName, String pRecordSeparator, String pFieldSeparator) throws Exception {
        File outputFile = new File(pFileName);


        FileOutputStream fos = new FileOutputStream(outputFile);
        OutputStreamWriter osw = new OutputStreamWriter(fos, pVs.getVectorManager().getLocale().getDisplayName());
        BufferedWriter output = new BufferedWriter(osw);

        StringBuffer sb = new StringBuffer();

        // Loop the vectors
        for (int i = 0; i < pVs.size(); i++) {
            sb.delete(0, sb.length());

            // Add the string
            sb.append(pVs.get(i).getData());
            sb.append(pFieldSeparator);

            for (int j = 0; j < pVs.get(i).getByteCoordinates().length; j++) {
                sb.append(pVs.get(i).getByteCoordinates()[j]);

                if (j < pVs.get(i).getByteCoordinates().length - 1) {
                    sb.append(INNER_FIELD_SEPARATOR);
                }
            }

            sb.append(pRecordSeparator);
            output.write(sb.toString());
        }

        output.close();
    }


}
