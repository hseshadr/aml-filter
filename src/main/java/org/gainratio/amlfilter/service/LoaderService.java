package org.gainratio.amlfilter.service;

import lombok.AllArgsConstructor;
import org.gainratio.amlfilter.model.Entity;
import org.gainratio.amlfilter.parser.Parser;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;
import java.util.ArrayList;
import java.util.List;

@Component
@AllArgsConstructor
public class LoaderService implements LoaderServiceInterface {
    private static final Logger logger = LoggerFactory.getLogger(LoaderService.class);
    private final Parser<List<Entity>> sdnParser;
    private final EntityService entityService;
    private final EventPublisher<List<Entity>> eventPublisher;

    @PostConstruct
    void init() throws Exception {
        logger.info("sdnParser={}", sdnParser);
        load();
    }

    @Override
    public List<Entity> load() throws Exception {
        List<Entity> entities = new ArrayList<>();
        entities.addAll(parseSdn());
        eventPublisher.publishEvent(new GenericEvent<>(entities));
        return entities;
    }

    private List<Entity> parseSdn() throws Exception {
        return new ArrayList<>();
    }
}
