package org.gainratio.amlfilter.service;

import org.gainratio.amlfilter.loader.LoaderInfo;

public interface LoaderServiceInterface {
    LoaderInfo load() throws Exception;
}