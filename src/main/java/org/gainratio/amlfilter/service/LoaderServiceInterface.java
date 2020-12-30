package org.gainratio.amlfilter.service;

import org.gainratio.amlfilter.model.Entity;

import java.util.List;

public interface LoaderServiceInterface {
    List<Entity> load() throws Exception;
}