package org.gainratio.amlfilter.service;

import lombok.AllArgsConstructor;
import lombok.Data;
import org.gainratio.amlfilter.model.Entity;
import org.gainratio.amlfilter.model.EntityCodeAndNames;
import org.gainratio.amlfilter.repository.EntityRepository;
import org.gainratio.amlfilter.util.AlgorithmUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
import java.util.*;

@Service
@Data
@AllArgsConstructor
public class EntityService {
    private static final Logger logger = LoggerFactory.getLogger(EntityService.class);
    private final EntityRepository entityRepository;
    private Map<String, Entity> entityCodeToEntityMap;
    private Map<String, Set<String>> nameToEntityCodeSetMap = new HashMap<>();

    @PostConstruct
    public void init() {
    }

    public void saveAll(List<Entity> entityList) {
        entityRepository.saveAll(entityList);
    }

    private void buildNameToEntityCodesSetMap(List<Entity> entityList) {
        for (Entity entity : entityList) {
            for (String name : entity.getEntityNameSet()) {
                Set<String> entityCodeSet = nameToEntityCodeSetMap.get(name);
                if (null == entityCodeSet) {
                    entityCodeSet = new HashSet<>();
                    nameToEntityCodeSetMap.put(name, entityCodeSet);
                }
                entityCodeSet.add(entity.getListName() + entity.getEntityCodeInSource());
            }
        }
    }

    public void buildNameToEntityCodesSetMapForTest(List<EntityCodeAndNames> entityCodeAndNamesList) {
        for (EntityCodeAndNames entityCodeAndNames : entityCodeAndNamesList) {
            Entity entity = new Entity();
            entity.setEntityCodeInSource(entityCodeAndNames.getEntityCode());
            entity.setListName("SDN");
            entity.setEntityNameSet(entityCodeAndNames.getNameSet());
            entityCodeToEntityMap.put(entityCodeAndNames.getEntityCode(), entity);

            for (String name : entityCodeAndNames.getNameSet()) {
                name = AlgorithmUtils.cleanString(name);
                if (name.equals("RESIDENCIAL CANAL VIEW SA")) {
                    logger.info("PANK={}", name);
                }
                Set<String> entityCodeSet = nameToEntityCodeSetMap.get(name);
                if (null == entityCodeSet) {
                    entityCodeSet = new HashSet<>();
                    nameToEntityCodeSetMap.put(name, entityCodeSet);
                }
                entityCodeSet.add(entityCodeAndNames.getEntityCode());
            }
        }
        logger.info("mameToEntityCodeSetMap.size()={}", nameToEntityCodeSetMap.size());
    }

    public Set<String> getEntityCodesForName(String name) {
        return nameToEntityCodeSetMap.get(name);
    }

    public Entity getEntitiesForCode(String entityCode) {
        return entityCodeToEntityMap.get(entityCode);
    }
}
