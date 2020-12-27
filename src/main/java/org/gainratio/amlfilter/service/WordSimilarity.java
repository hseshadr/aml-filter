package org.gainratio.amlfilter.service;

import lombok.Data;

/**
 * The word similarity essentially is an object that
 * contains the string similarity & the phonetic similarity
 * between two words
 */
@Data
public class WordSimilarity {
    private float phoneticSimilarity = 0f;
    private float stringSimilarity = 0f;
}