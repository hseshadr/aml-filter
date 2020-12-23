package org.gainratio.amlfilter.service;

import lombok.Data;
import org.gainratio.amlfilter.model.Synonym;
import org.gainratio.amlfilter.repository.SynonymRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;


/**
 * Implements the synonym service behavior:
 * - Loads all synonyms into a memory map
 * - Periodically loads unchecked synonyms
 * that were added to the DB into the memory map
 * TODO: The whole caching mechanism used, should
 * be modified to use spring modules caching services,
 * which is far more elegant and configurable.
 */
@Service
@Data
public class SynonymService implements SynonymServiceInterface {
    private static final Logger logger = LoggerFactory.getLogger(SynonymService.class);
    private final Map<String, String> synonymMap = new HashMap<>();
    @Autowired
    private SynonymRepository synonymRepository;

    @PostConstruct
    public void init() throws Exception {
        loadAllSynonyms();
    }

    public String getSynonymName(String pName) {
        String methodSignature = "String getSynonymName(String): ";
        String[] tokens = pName.split(" ");
        StringBuilder synonymNameBuffer = new StringBuilder();

        for (int count = 0; count < tokens.length; count++) {
            String synonymName = getSynonymMap().get(tokens[count]);
            if (null != synonymName) {
                synonymNameBuffer.append(synonymName);
            } else {
                synonymNameBuffer.append(tokens[count]);
            }
            if (count < tokens.length) {
                synonymNameBuffer.append(" ");
            }
        }

        String synonymName = synonymNameBuffer.toString().trim();

        if (pName.trim().equals(synonymName)) {
            return pName;

        }

        return synonymName;
    }

    protected void setSynonym(String pName, String pSynonymName) {
        getSynonymMap().put(pName, pSynonymName);
    }

    public void loadAllSynonyms() {
        List<Synonym> synonyms = getSynonymRepository().findAll();
        Iterator synonymsIterator = synonyms.iterator();
        while (synonymsIterator.hasNext()) {
            Synonym synonym = (Synonym) synonymsIterator.next();
            setSynonym(synonym.getWord(), synonym.getSynonym());
        }
        logger.info("Loaded all the synonyms from the database, count = {}", synonyms.size());
    }

    public void loadAll() {
        loadAllSynonyms();
    }
}