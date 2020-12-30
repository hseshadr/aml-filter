package org.gainratio.amlfilter.vector.vectorSpace;

import lombok.Data;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

@Data
public class VectorDefinition implements Serializable {
    private static final long serialVersionUID = 8208810144255725306L;
    private String name;
    private String description;
    private List<VectorDimensionSubsetDefinition> vectorDimensionSubsetDefinitions;
    private int maximumBitSetSimilarityResults;
    private int maximumCosineSimilarityResults;

    public static VectorDefinition makeRawVecDefinition() {
        VectorDefinition vecDef = new VectorDefinition();
        VectorDimensionSubsetDefinition vecDimSubsetDef = new VectorDimensionSubsetDefinition();
        vecDimSubsetDef.setName("Raw");
        vecDimSubsetDef.setVectorDimensionSubsetHandler(new SubsetHandler_raw());

        // Subsets
        List<VectorDimensionSubsetDefinition> vdsd = new ArrayList<VectorDimensionSubsetDefinition>();
        vdsd.add(vecDimSubsetDef);

        // Vector definition settings
        vecDef.setName("Raw");
        vecDef.setDescription("Data is stored in raw format.");
        vecDef.setVectorDimensionSubsetDefinitions(vdsd);

        return vecDef;
    }

    public static VectorDefinition makeCsvVecDefinition() {
        VectorDefinition vecDef = new VectorDefinition();

        VectorDimensionSubsetDefinition vecDimSubsetDef = new VectorDimensionSubsetDefinition();
        vecDimSubsetDef.setName("CSV");
        vecDimSubsetDef.setVectorDimensionSubsetHandler(new SubsetHandler_csv());

        // Subsets
        List<VectorDimensionSubsetDefinition> vdsd = new ArrayList<VectorDimensionSubsetDefinition>();
        vdsd.add(vecDimSubsetDef);

        // Vector definition settings
        vecDef.setName("CSV");
        vecDef.setDescription("Data is stored in CSV format. Comes from CSV files.");
        vecDef.setVectorDimensionSubsetDefinitions(vdsd);

        return vecDef;
    }
}