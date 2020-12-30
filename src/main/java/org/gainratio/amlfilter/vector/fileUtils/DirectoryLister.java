package org.gainratio.amlfilter.vector.fileUtils;

import java.io.File;
import java.io.FilenameFilter;

public class DirectoryLister {

    public DirectoryLister() {
        super();
    }

    /**
     * Retrieves the png files from a directory
     *
     * @param pDirPath
     * @return
     */
    public static String[] getPngFilesInDirectory(String pDirPath) {
        File dir = new File(pDirPath);

        String[] children = dir.list();
        if (children == null) {
            // Either dir does not exist or is not a directory
            return null;
        }

        FilenameFilter filter = new FilenameFilter() {
            public boolean accept(File dir, String name) {
                return name.contains(".png");
            }
        };
        children = dir.list(filter);

        return children;
    }


    /**
     * Retrieves the files for the learning process for simple patterns - noise
     *
     * @param pDirPath
     * @return
     */
    public static String[] get_SP_Noise_FilesInDirectory(String pDirPath) {
        File dir = new File(pDirPath);

        String[] children = dir.list();
        if (children == null) {
            // Either dir does not exist or is not a directory
            return null;
        }

        FilenameFilter filter = new FilenameFilter() {
            public boolean accept(File dir, String name) {
                return name.contains("FILE_DATA_7");
            }
        };
        children = dir.list(filter);

        return children;
    }

}
