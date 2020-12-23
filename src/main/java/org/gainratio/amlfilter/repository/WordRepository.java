package org.gainratio.amlfilter.repository;

import org.gainratio.amlfilter.model.Word;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface WordRepository extends JpaRepository<Word, Long> {
    List<Word> findAll();

    @Query("select max(w.numTimesFound) from Word w")
    int findMaximumWordFrequency();

    @Query("select min(w.numTimesFound) from Word w")
    int findMinimumWordFrequency();
}
