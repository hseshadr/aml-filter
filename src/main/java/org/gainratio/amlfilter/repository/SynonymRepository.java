package org.gainratio.amlfilter.repository;

import org.gainratio.amlfilter.model.Synonym;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface SynonymRepository extends JpaRepository<Synonym, Long> {

    Synonym findSynonymById(long pSynonymId);

    List<Synonym> findAll();

    Synonym findSynonymByWord(String word);
}
