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

package org.gainratio.amlfilter.search.fileUtils;

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
