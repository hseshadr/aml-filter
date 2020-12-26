package org.gainratio.amlfilter.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.Data;
import lombok.NonNull;
import org.gainratio.amlfilter.model.Synonym;
import org.gainratio.amlfilter.repository.SynonymRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.ResourceUtils;

import javax.annotation.PostConstruct;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;


/**
 * Implements the synonym service behavior:
 * - Loads all synonyms into a memory map
 * - Periodically loads unchecked synonyms
 * that were added to the DB into the memory map
 */
@Service
@Data
public class SynonymService implements SynonymServiceInterface {
    private static final Logger logger = LoggerFactory.getLogger(SynonymService.class);
    private static final ObjectMapper objectMapper = new ObjectMapper();
    private File resourceFile;

    private Map<String, String> synonymMap = new HashMap<>();

    @Autowired
    private SynonymRepository synonymRepository;

    @PostConstruct
    public void init() throws Exception {
        loadAll();
    }

    @Override
    public void loadAll() throws Exception {
        List<Synonym> synonymList = getSynonymRepository().findAll();
        if (synonymList.isEmpty()) {
            synonymList = loadFromFileResource();
            synonymList = synonymRepository.saveAll(synonymList);
        }
        loadAllSynonyms(synonymList);
    }

    public List<String> getSynonymName(@NonNull String pName) {
        return Arrays.stream(pName.split(" "))
                .map(s -> getSynonymMap().get(s)).collect(Collectors.toList());
    }

    private void loadAllSynonyms(List<Synonym> synonymList) throws IOException {
        synonymMap = synonymList
                .stream().collect(Collectors.toMap(e -> e.getWord(), e -> e.getSynonym()));
        logger.info("Loaded all the synonyms from the database, count = {}", synonymMap.size());
    }

    private File getFileResource() throws FileNotFoundException {
        return ResourceUtils.getFile(
                "classpath:synonym.json");
    }

    private List<Synonym> loadFromFileResource() throws IOException {
        List<Synonym> synonymList = objectMapper.readValue(getFileResource(), new TypeReference<List<Synonym>>() {
        });
        logger.info("Loading from resourceFile={}, synonymList={}", resourceFile, synonymList);
        return synonymList;
    }
}