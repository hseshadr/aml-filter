package org.gainratio.amlfilter.service;

import lombok.Data;
import org.gainratio.amlfilter.search.vectorSpace.VectorSpace;
import org.springframework.stereotype.Service;

/**
 * Maintains and loads the search engine resources atomically
 */
@Service
@Data
public class VectorSpaceService {
    private VectorSpace vectorSpace;
}
