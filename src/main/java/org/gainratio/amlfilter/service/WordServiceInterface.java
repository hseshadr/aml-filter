package org.gainratio.amlfilter.service;

import org.gainratio.amlfilter.model.Word;

public interface WordServiceInterface {
    Word getWord(String pWord);

    void loadAll() throws Exception;

}