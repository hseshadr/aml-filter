package org.gainratio.amlfilter.vector.vectorSpace;

import lombok.Data;

@Data
public class TreeResult {
    public String searchName;
    public int positionInResultsList = -1;
    public int positionInVectorList = -1;
    public double similarity = 0;
    public float pairSimilarity = -1;
    public VectorData foundVectorData = null;
    public boolean mark = false;
    public VectorData parent = null;


    public boolean isMarked() {
        return mark;
    }

    public void setMark() {
        mark = true;
    }

    public void unsetMark() {
        mark = false;
    }


}