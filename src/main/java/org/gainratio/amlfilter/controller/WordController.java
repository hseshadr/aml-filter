package org.gainratio.amlfilter.controller;

import org.gainratio.amlfilter.model.Word;
import org.gainratio.amlfilter.service.WordService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
public class WordController {

    private final WordService wordService;

    @Autowired
    public WordController(WordService wordService) {
        this.wordService = wordService;
    }

    @GetMapping("/word/map")
    Map<String, Word> map() {
        return wordService.getWordMap();
    }

    @GetMapping("/word/{name}")
    Word wordByName(@PathVariable String name) {
        return wordService.getWord(name);
    }
}
