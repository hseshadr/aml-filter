package org.gainratio.amlfilter.repository;

import org.gainratio.amlfilter.model.Entity;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.data.mongodb.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface EntityRepository extends MongoRepository<Entity, Long> {
    @Query(value = "{'listName' : $0}", delete = true)
    public List<Entity> deleteByListName(String listName);
}

