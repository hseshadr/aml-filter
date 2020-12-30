package org.gainratio.amlfilter.service;

import lombok.Data;
import org.gainratio.amlfilter.vector.vectorSpace.VectorSpace;
import org.gainratio.amlfilter.vector.vectorSpace.flat.VectorSpaceFlat;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;

/**
 * Maintains and loads the search engine resources atomically
 */
@Service
@Data
public class VectorSpaceService {
    private VectorSpace vectorSpace;
    private VectorSpaceFlat vectorSpaceFlat;

    @PostConstruct
    public void init() {
        vectorSpaceFlat = VectorSpaceFlat.createTestVectorSpaceFlat();
    }
}
