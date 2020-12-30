package org.gainratio.amlfilter.vector.vectorSpace.flat;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class VectorDataFlat {
    private String id;
    private String data;
    private byte[] byteCoordinates;
}