package org.gainratio.amlfilter.search.vectorSpace;

import lombok.Data;

import java.io.Serializable;

/**
 * Defines the vector dimension subset and holds
 * a handler for it.
 */
@Data
public class VectorDimensionSubsetDefinition implements Serializable {
    private static final long serialVersionUID = -8171367772360207844L;

    private String name;
    private String description;
    /*
     * The cosine vector building weight
     * (Specifies the percentage to be multiplied to each computation
     * of each dimension within the subset; so as to provide a weighting measure
     * to give the vector more or less significance).
     */
    private float cosineVectorBuildingWeight = 1;
    /*
     * The vector dimension subset handler
     */
    private VectorDimensionSubsetHandler vectorDimensionSubsetHandler;
}