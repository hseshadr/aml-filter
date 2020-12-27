package org.gainratio.amlfilter.service;

import org.gainratio.amlfilter.search.vectorSpace.VectorSpace;

import java.io.Serializable;
import java.util.HashMap;
import java.util.Map;


public class SearchEngineResource implements Serializable {
    private static final long serialVersionUID = 1L;
    private final Map<String, VectorSpace> mDesignationToVectorSpaceMap = new HashMap<String, VectorSpace>();

}
