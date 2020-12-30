package org.gainratio.amlfilter.vector.dataFiles;

import org.gainratio.amlfilter.vector.vectorSpace.VectorSpace;

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
