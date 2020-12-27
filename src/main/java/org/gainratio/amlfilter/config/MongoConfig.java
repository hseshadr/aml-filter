package org.gainratio.amlfilter.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.data.mongodb.repository.config.EnableMongoRepositories;

@Configuration
@EnableMongoRepositories(basePackages = "org.gainratio.amlfilter.repository")
public class MongoConfig {

}