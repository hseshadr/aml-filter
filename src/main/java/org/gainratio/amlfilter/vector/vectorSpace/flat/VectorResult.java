package org.gainratio.amlfilter.vector.vectorSpace.flat;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class VectorResult {
    public String name;
    public double similarity;
    public VectorDataFlat foundVectorDataFlat;
}