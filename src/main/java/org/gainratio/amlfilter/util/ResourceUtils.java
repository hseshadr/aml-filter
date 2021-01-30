package org.gainratio.amlfilter.util;

import org.apache.commons.io.IOUtils;
import org.springframework.core.io.ClassPathResource;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

public class ResourceUtils {
    public static InputStream getResourceInputStream(String fileName) throws IOException {
        return new ClassPathResource(
                fileName, ResourceUtils.class.getClassLoader()).getInputStream();
    }

    public  static List<String> loadLinesFromInputStream(InputStream fileInputStream) throws IOException {
        List<String> lines = IOUtils.readLines(fileInputStream,"UTF-8");
        return lines;
    }

    public static List<String> loadLines(String fileName) throws IOException {
        return loadLinesFromInputStream(getResourceInputStream(fileName));
    }
}
