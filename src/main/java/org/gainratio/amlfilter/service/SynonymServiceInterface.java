package org.gainratio.amlfilter.service;

import lombok.NonNull;

import java.util.List;
import java.util.Map;

public interface SynonymServiceInterface {
    void loadAll() throws Exception;
    String getSynonymName(@NonNull String pName);
    Map<String, String> getSynonymMap();
}