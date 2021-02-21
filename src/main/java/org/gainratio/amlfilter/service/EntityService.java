package org.gainratio.amlfilter.service;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.gainratio.amlfilter.model.Entity;
import org.gainratio.amlfilter.model.EntityCodeAndNames;
import org.gainratio.amlfilter.model.GenericEvent;
import org.gainratio.amlfilter.repository.EntityRepository;
import org.gainratio.amlfilter.util.AlgorithmUtils;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.ApplicationListener;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
import java.util.*;

@Service
@Data
@AllArgsConstructor
@Slf4j
public class EntityService implements ApplicationListener<GenericEvent> {
    private final EntityRepository entityRepository;
    private final ApplicationEventPublisher applicationEventPublisher;

    private Map<String, Entity> entityCodeToEntityMap;
    private Map<String, Set<String>> nameToEntityCodeSetMap = new HashMap<>();

    @PostConstruct
    public void init() {
    }

    private void load() {
        List<Entity> entityList = entityRepository.findAll();
        buildNameToEntityCodesSetMap(entityList);
        log.info("Loaded entities: size={}", entityList.size());
    }

    private void buildNameToEntityCodesSetMap(List<Entity> entityList) {
        for (Entity entity : entityList) {
            entityCodeToEntityMap.put(entity.getEntityCodeInSource(), entity);
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
                Set<String> entityCodeSet = nameToEntityCodeSetMap.get(name);
                if (null == entityCodeSet) {
                    entityCodeSet = new HashSet<>();
                    nameToEntityCodeSetMap.put(name, entityCodeSet);
                }
                entityCodeSet.add(entityCodeAndNames.getEntityCode());
            }
        }
        log.info("mameToEntityCodeSetMap.size()={}", nameToEntityCodeSetMap.size());
    }

    private List<EntityCodeAndNames> convertEntitiesToEntityCodeAndNames() {
        List<EntityCodeAndNames> entityCodeAndNamesList = new ArrayList<>();
        for (Entity entity : entityCodeToEntityMap.values()) {
            EntityCodeAndNames entityCodeAndNames = EntityCodeAndNames.builder()
                    .entityCode(entity.getEntityCodeInSource())
                    .nameSet(entity.getEntityNameSet()).build();
            entityCodeAndNamesList.add(entityCodeAndNames);
        }
        return entityCodeAndNamesList;

    }

    public Set<String> getEntityCodesForName(String name) {
        return nameToEntityCodeSetMap.get(name);
    }

    public Entity getEntitiesForCode(String entityCode) {
        return entityCodeToEntityMap.get(entityCode);
    }

    @Override
    public void onApplicationEvent(GenericEvent event) {
        if (event.getEventType() == GenericEvent.EventType.LOADER) {
            log.info("Received loader event - " + event.getEventType());
            load();
            List<EntityCodeAndNames> entityCodeAndNamesList = convertEntitiesToEntityCodeAndNames();
            applicationEventPublisher.publishEvent(new GenericEvent(GenericEvent.EventType.GENERATE_VECTORS,
                    entityCodeAndNamesList));
        }
    }
}
