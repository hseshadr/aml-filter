package org.gainratio.amlfilter.service;

import lombok.Data;
import org.gainratio.amlfilter.model.Entity;
import org.gainratio.amlfilter.model.EntityCodeAndNames;
import org.gainratio.amlfilter.util.AlgorithmUtils;
import org.gainratio.amlfilter.vector.vectorSpace.VectorSpace;
import org.gainratio.amlfilter.vector.vectorSpace.flat.VectorDataFlat;
import org.gainratio.amlfilter.vector.vectorSpace.flat.VectorSpaceFlat;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
import java.util.ArrayList;
import java.util.List;

/**
 * Maintains and loads the search engine resources atomically
 */
@Service
@Data
public class VectorSpaceService {
    private static final Logger logger = LoggerFactory.getLogger(VectorSpaceService.class);
    private VectorSpace vectorSpace;
    private VectorSpaceFlat vectorSpaceFlat;
    @Autowired
    private EntityService entityService;

    @PostConstruct
    public void init() {
        createVectorSpaceFlat();
    }

    public void createVectorSpaceFlat() {
        VectorSpaceFlat vectorSpaceFlat
                = new VectorSpaceFlat();
        List<VectorDataFlat> vectorDataFlatList = new ArrayList<>();
        vectorSpaceFlat.setVectorDataList(vectorDataFlatList);
        for (Entity entity : getEntityService().getEntityMap()
                     .values()) {
            for (String name : entity.getEntityNameSet()) {
                name = AlgorithmUtils.cleanString(name);
                VectorDataFlat vd = vectorSpaceFlat.createVector(entity.getEntityCodeInSource(), name);
                vectorDataFlatList.add(vd);
            }
        }
        setVectorSpaceFlat(vectorSpaceFlat);
        logger.info("vectorDataFlatList.size()={}", vectorDataFlatList.size());
    }

    public void createVectorSpaceFlat(List<EntityCodeAndNames> entityCodeAndNamesList) {
        VectorSpaceFlat vectorSpaceFlat
                = new VectorSpaceFlat();
        List<VectorDataFlat> vectorDataFlatList = new ArrayList<>();
        vectorSpaceFlat.setVectorDataList(vectorDataFlatList);
        for (EntityCodeAndNames nameAndEntityCode : entityCodeAndNamesList) {
            for (String name : nameAndEntityCode.getNameSet()) {
                VectorDataFlat vd = vectorSpaceFlat.createVector(nameAndEntityCode.getEntityCode(),
                        name);
                vectorDataFlatList.add(vd);
            }
        }
        setVectorSpaceFlat(vectorSpaceFlat);
        logger.info("vectorDataFlatList.size()={}", vectorDataFlatList.size());
    }
}
