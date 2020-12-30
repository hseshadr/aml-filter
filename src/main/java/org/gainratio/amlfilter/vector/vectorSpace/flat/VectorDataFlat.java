package org.gainratio.amlfilter.vector.vectorSpace.flat;

import lombok.Data;

@Data
public class VectorDataFlat {
    private String id;
    private String data;
    private byte[] byteCoordinates;
}