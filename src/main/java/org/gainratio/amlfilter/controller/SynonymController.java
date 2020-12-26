package org.gainratio.amlfilter.controller;

import org.gainratio.amlfilter.service.SynonymService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
public class SynonymController {

    private final SynonymService synonymService;

    @Autowired
    public SynonymController(SynonymService synonymService) {
        this.synonymService = synonymService;
    }

    @GetMapping("/synonym/map")
    Map<String, String> map() {
        return synonymService.getSynonymMap();
    }

    @GetMapping("/synonym/{name}")
    List<String> synonyms(@PathVariable String name) {
        return synonymService.getSynonymName(name);
    }
}
