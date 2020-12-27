package org.gainratio.amlfilter;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class AmlFilterApplication {
    private static final Logger logger = LoggerFactory.getLogger(AmlFilterApplication.class);

    public static void main(String[] args) {
        logger.info("PANK: = {}", System.getProperties().toString());
        SpringApplication.run(AmlFilterApplication.class, args);
    }

}
