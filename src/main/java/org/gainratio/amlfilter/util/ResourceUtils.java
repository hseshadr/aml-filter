package org.gainratio.amlfilter.util;

import org.apache.commons.io.FileUtils;
import org.apache.commons.io.IOUtils;
import org.springframework.core.io.ClassPathResource;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

public class ResourceUtils {
    public static InputStream getResourceInputStream(String fileName) throws IOException {
        return new ClassPathResource(
                fileName, ResourceUtils.class.getClassLoader()).getInputStream();
    }

    public  static List<String> loadLinesFromInputStream(InputStream fileInputStream) throws IOException {
        return IOUtils.readLines(fileInputStream, StandardCharsets.UTF_8);
    }

    public static List<String> loadLines(String fileName) throws IOException {
        File f = new File(fileName);
        if (f.exists()) {
            return FileUtils.readLines(f, StandardCharsets.UTF_8);
        }
        return loadLinesFromInputStream(getResourceInputStream(fileName));
    }
}
