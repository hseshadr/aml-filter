package org.gainratio.amlfilter.repository;

import org.gainratio.amlfilter.model.Word;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface WordRepository extends MongoRepository<Word, Long> {
    Word findFirstByOrderByNumTimesFoundDesc();

    Word findFirstByOrderByNumTimesFoundAsc();
}
