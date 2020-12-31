package org.gainratio.amlfilter.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.Data;
import org.gainratio.amlfilter.model.Word;
import org.gainratio.amlfilter.repository.WordRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;


/**
 * Implements the word service behavior:
 * - Loads all words into a memory map
 * - Periodically loads unchecked words
 * that were added to the DB into the memory map
 * TODO: The whole caching mechanism used, should
 * be modified to use spring modules caching services,
 * which is far more elegant and configurable.
 */
@Component
@Data
public class WordService implements WordServiceInterface {
    private static final Logger logger = LoggerFactory.getLogger(WordService.class);
    private static final ObjectMapper objectMapper = new ObjectMapper();
    public static double MIN_POSSIBLE_WEIGHT = 0.001d;
    private File resourceFile;
    private Map<String, Word> wordMap = new HashMap<>();
    private int informationLevelScale = 10;
    private int maximumWordFrequency = Integer.MAX_VALUE;
    private double maximumFrequencyNaturalLog = 0f;
    private int minimumWordFrequency = 1;
    private double minimumFrequencyNaturalLog = 0f;
    private Set<String> lowWeightWordsSet;
    private float defaultLowWeight;
    private boolean loadWordSimilaritiesFlag = false;

    @Autowired
    private WordRepository wordRepository;

    @PostConstruct
    public void init() throws Exception {
        loadAll();
    }

    public void loadAll() throws Exception {
        List<Word> wordList = getWordRepository().findAll();
        if (wordList.isEmpty()) {
            wordList = loadFromFileResource();
            wordList = wordRepository.saveAll(wordList);
        }
        loadAllWords(wordList);

        if (Integer.MAX_VALUE == getMaximumWordFrequency()) {
            setMaximumWordFrequency(getWordRepository().findFirstByOrderByNumTimesFoundDesc().getNumTimesFound());
        }
        if (-1 == getMinimumWordFrequency()) {
            setMinimumWordFrequency(getWordRepository().findFirstByOrderByNumTimesFoundAsc().getNumTimesFound());
        }

        logger.info("maximumWordFrequency={}", getMaximumWordFrequency());
        logger.info("minimumWordFrequency={}", getMinimumWordFrequency());
        logger.info("maximumFrequencyNaturalLog={}", getMaximumFrequencyNaturalLog());
        logger.info("minimumFrequencyNaturalLog={}", getMinimumFrequencyNaturalLog());
    }

    /**
     * Load all the words from the database to the word map
     */
    public void loadAllWords(List<Word> wordList) throws IOException {
        Map<String, Word> tmpWordMap = wordList
                .stream().collect(Collectors.toMap(e -> e.getWord(), e -> e));
        wordMap = tmpWordMap;
        logger.info("Loaded all the words from the database, count = {}", wordList.size());
    }

    private InputStream getResourceInputStream() throws IOException {
        return new ClassPathResource(
                "word.json", getClass().getClassLoader()).getInputStream();
    }

    private List<Word> loadFromFileResource() throws IOException {
        List<Word> wordList = objectMapper.readValue(getResourceInputStream(), new TypeReference<List<Word>>() {
        });
        logger.info("Loading from resourceFile={}, wordList.size()={}", resourceFile, wordList.size());
        return wordList;
    }

    public void setMaximumWordFrequency(int pMaximumWordFrequency) {
        maximumWordFrequency = pMaximumWordFrequency;
        setMaximumFrequencyNaturalLog(Math.log(maximumWordFrequency));
    }

    public void setMinimumWordFrequency(int pMinimumWordFrequency) {
        minimumWordFrequency = pMinimumWordFrequency;
        setMinimumFrequencyNaturalLog(Math.log(minimumWordFrequency));
    }

    public Word getWord(String pWord) {
        return getWordMap().get(pWord.toUpperCase());
    }

    protected void setWord(String pWordStr, Word pWordObj) {
        getWordMap().put(pWordStr.toUpperCase(), pWordObj);
    }

    @Override
    public float getWordLength(String pWordName) {
        if (null == pWordName || pWordName.trim().equals("")) {
            return 0f;
        }
        return pWordName.length();
    }

    public float getWordWeight(String pWordName) {
        double weight = getInformationLevelScale();

        if (null == pWordName || pWordName.trim().equals("")) {
            return 0f;
        }

        // If it is part of the redundant words
        if (null != getLowWeightWordsSet() && getLowWeightWordsSet().contains(pWordName)) {
            weight = getDefaultLowWeight();
        } else {
            Word word = getWord(pWordName);

            // If we do not know the word
            if (null == word) {
                // NEW
                // If the word is not found it is meaningful!
                // So we shall assign it the highest level of information
                weight = getInformationLevelScale();
            } else // If the word is known
            {
                /** START - OLD WAY **/
                // Get the frequency to compute the weight
                //float freq = word.getNumberOfTimesFound();
                // Compute the weight
                //weight = 10 - Math.log(freq + 1);
                // Include a size component in the weight
                //weight = (weight*5 + pWordName.length()) / 6;
                /** END - OLD WAY **/

                /** START - NEW WAY **/
                double maxWFLN = getMaximumFrequencyNaturalLog();
                double minWFLN = getMinimumFrequencyNaturalLog();
                int numTimesFound = word.getNumTimesFound();
                double wordWFLN = Math.log(numTimesFound);
                double informationLevel = ((maxWFLN - wordWFLN) / (maxWFLN - minWFLN)) * getInformationLevelScale();
                if (logger.isDebugEnabled()) {
                    logger.debug("++++++++++ Information level for word (" + word + ") = " + informationLevel);
                }
                weight = informationLevel;
                /** END - NEW WAY **/
            }
        }
        if (weight > getInformationLevelScale()) {
            weight = getInformationLevelScale();
        }
        return (float) weight;
    }

    /**
     * Get name information level
     */
    public float getNameInformationLevel(String pName) {
        pName = AlgorithmsService.cleanString(pName);
        float informationLevel = 0f;
        float fullInformationLevel = 0f;
        String[] tokens = pName.split(" ");
        for (int j = 0; j < tokens.length; j++) {
            String token = tokens[j].trim();
            // Skip this token since it is empty
            if (null == token || token.equals("")) {
                continue;
            }
            informationLevel = getWordWeight(token);
            fullInformationLevel += informationLevel;

        }
        return fullInformationLevel;
    }
}
