package org.gainratio.amlfilter.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.Data;
import lombok.NonNull;
import org.apache.commons.io.IOUtils;
import org.gainratio.amlfilter.model.Synonym;
import org.gainratio.amlfilter.repository.SynonymRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.Charset;
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
            synonymList = loadFromResource();
            loadAllSynonyms(synonymList);
        }
    }

    @Override
    public String getSynonymName(@NonNull String name) {
        name = AlgorithmsService.cleanString(name);
        return Arrays.stream(name.split(" "))
                .map(s -> getSynonymMap().getOrDefault(s.trim(), s)).collect(Collectors.joining(" "));
    }

    private void loadAllSynonyms(List<Synonym> synonymList) {
        synonymMap = synonymList
                .stream().collect(Collectors.toMap(s -> s.getWord(), s -> s.getSynonym()));
        logger.info("Loaded all the synonyms from the database, count = {}", synonymMap.size());
    }

    private InputStream getResourceInputStream() throws IOException {
        return new ClassPathResource(
                "synonyms.txt", getClass().getClassLoader()).getInputStream();
    }

    private List<Synonym> loadFromResource() throws IOException {
        List<String> records = IOUtils.readLines(getResourceInputStream(), Charset.defaultCharset());
        List<Synonym> synonymList = records.stream().map(SynonymService::parseRecordIntoSynonym)
                .collect(Collectors.toList());
        logger.info("synonymList.size()={}", synonymList.size());
        return synonymList;
    }

    private static Synonym parseRecordIntoSynonym(String record) {
        String[] tokens = record.split(",");
        Synonym synonym = new Synonym();
        synonym.setId(new Long(tokens[0].trim()));
        synonym.setWord(tokens[1].trim());
        synonym.setSynonym(tokens[2].trim());
        return synonym;
    }
}