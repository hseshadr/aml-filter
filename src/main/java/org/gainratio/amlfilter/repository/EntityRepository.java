package org.gainratio.amlfilter.repository;

import org.gainratio.amlfilter.model.Entity;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface EntityRepository extends MongoRepository<Entity, Long> {
}

