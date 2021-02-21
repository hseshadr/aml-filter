package org.gainratio.amlfilter.repository;

import org.gainratio.amlfilter.loader.LoaderInfo;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface LoaderInfoRepository extends MongoRepository<LoaderInfo, Long> {

}

