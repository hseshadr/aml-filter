package org.gainratio.amlfilter.repository;

import org.gainratio.amlfilter.model.Synonym;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface SynonymRepository extends MongoRepository<Synonym, Long> {
}

