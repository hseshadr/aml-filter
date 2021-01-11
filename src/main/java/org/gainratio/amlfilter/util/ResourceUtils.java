package org.gainratio.amlfilter.util;

import org.springframework.core.io.ClassPathResource;

import java.io.IOException;
import java.io.InputStream;

public class ResourceUtils {
    public static InputStream getResourceInputStream(String fileName) throws IOException {
        return new ClassPathResource(
                fileName, ResourceUtils.class.getClassLoader()).getInputStream();
    }
}
