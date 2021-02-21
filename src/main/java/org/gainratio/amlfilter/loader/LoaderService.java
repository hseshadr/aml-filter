package org.gainratio.amlfilter.loader;

import lombok.AllArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.gainratio.amlfilter.model.Entity;
import org.gainratio.amlfilter.model.GenericEvent;
import org.gainratio.amlfilter.parser.eu.EUParser;
import org.gainratio.amlfilter.parser.ofac.SDNParser;
import org.gainratio.amlfilter.repository.EntityRepository;
import org.gainratio.amlfilter.repository.LoaderInfoRepository;
import org.gainratio.amlfilter.service.LoaderServiceInterface;
import org.gainratio.amlfilter.util.AlgorithmUtils;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

@Component
@AllArgsConstructor
@Slf4j
public class LoaderService implements LoaderServiceInterface {
    private final SDNParser sdnParser;
    private final EUParser euParser;
    private final EntityRepository entityRepository;
    private final LoaderInfoRepository loaderInfoRepository;
    private final ApplicationEventPublisher applicationEventPublisher;

    @PostConstruct
    void init() throws Exception {
        load();
    }

    @Override
    public LoaderInfo load() throws Exception {
        entityRepository.deleteAll();
        List<ListInfo> listInfoList = new ArrayList<>();
        listInfoList.add(parseAndLoadSdn());
        listInfoList.add(parseAndLoadEu());
        LoaderInfo loaderInfo = LoaderInfo.builder()
                .listInfoList(listInfoList)
                .loadedDate(LocalDate.now())
                .build();
        loaderInfo = loaderInfoRepository.save(loaderInfo);
        applicationEventPublisher.publishEvent(new GenericEvent(GenericEvent.EventType.LOADER, loaderInfo));
        log.info("Firing loader finished event: loaderInfo={}", loaderInfo);
        return loaderInfo;
    }

    private ListInfo parseAndLoadSdn() throws Exception {
        List<Entity> entityList = sdnParser.parse();
        addCleanedEntityNames(entityList);
        entityRepository.deleteByListName(SDNParser.LIST_NAME);
        entityRepository.saveAll(entityList);
        log.info("Done parsing SDN, entityList.size()={}", entityList.size());
        return ListInfo.builder()
                .numberOfRecords(entityList.size())
                .listName(SDNParser.LIST_NAME)
                .loadedDate(LocalDate.now())
                .build();
    }

    private ListInfo parseAndLoadEu() throws Exception {
        List<Entity> entityList = euParser.parse();
        addCleanedEntityNames(entityList);
        entityRepository.deleteByListName(EUParser.LIST_NAME);
        entityRepository.saveAll(entityList);
        log.info("Done parsing EU, entityList.size()={}", entityList.size());
        return ListInfo.builder()
                .numberOfRecords(entityList.size())
                .listName(EUParser.LIST_NAME)
                .loadedDate(LocalDate.now())
                .build();
    }

    private void addCleanedEntityNames(List<Entity> entityList) {
        for (Entity entity : entityList) {
            for (String name : entity.getEntityNameSet()) {
                name = AlgorithmUtils.cleanString(name);
                entity.getCleanedEntityNameSet().add(name);
            }
        }
    }
}
