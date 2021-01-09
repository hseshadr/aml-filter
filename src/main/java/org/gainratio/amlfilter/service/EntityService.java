package org.gainratio.amlfilter.service;

import lombok.AllArgsConstructor;
import lombok.Data;
import org.gainratio.amlfilter.model.Entity;
import org.gainratio.amlfilter.repository.EntityRepository;
import org.gainratio.amlfilter.util.AlgorithmUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@Data
@AllArgsConstructor
public class EntityService {
    private static final Logger logger = LoggerFactory.getLogger(EntityService.class);
    private final EntityRepository entityRepository;
    private Map<String, Entity> entityMap;

    @PostConstruct
    public void init() {
        loadEntityMap();
    }

    public void loadEntityMap() {
        List<Entity> entityList = entityRepository.findAll();
        buildEntityMap(entityList);
        logger.info("Loaded entityMap.size(): {}", entityMap.size());
    }

    public void saveAll(List<Entity> entityList) {
        entityRepository.saveAll(entityList);
        loadEntityMap();
    }

    public void buildEntityMap(List<Entity> entityList) {
        entityMap = entityList.stream()
                .collect(Collectors.toMap(e -> e.getEntityCodeInSource(), e -> e));
    }
}
