package org.gainratio.amlfilter.loader;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
public class LoaderServiceTest {
    @Autowired
    private LoaderService loaderService;

    @Test
    void test_load() throws Exception {
        LoaderInfo loaderInfo = loaderService.load();
        assertTrue(loaderInfo.getListInfoList().size() == 2);
    }
}
