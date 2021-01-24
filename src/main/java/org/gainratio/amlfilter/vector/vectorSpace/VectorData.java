package org.gainratio.amlfilter.vector.vectorSpace;

import lombok.Data;

import java.io.Serializable;
import java.nio.charset.StandardCharsets;


/**
 * This class holds a basic vector definition
 */
@Data
public class VectorData implements Serializable {
    private static final long serialVersionUID = 2691187260635546600L;
    /*
     * The mark to operate on the data
     */
    public boolean mark = false;
    private String id;
    private byte[] byteCoordinates;
    /*
     * The possible parent vector. Applicable only on a tree structure
     */
    private VectorData parentVector;
    private String data;
    /**
     * The child VectorSpace
     */
    private VectorSpace vectorSpace;
    /**
     * The distance to the parent ref vector
     */
    private float distanceToParent;


    public boolean isMarked() {
        return mark;
    }

    public void setMark() {
        mark = true;
    }

    public void unsetMark() {
        mark = false;
    }


    /**
     * Sets the vector space that is a child of this vector
     */
    public void setVectorSpace(VectorSpace pVectorSpace) {
        vectorSpace = pVectorSpace;

        if (null != pVectorSpace) {
            for (int i = 0; i < pVectorSpace.size(); i++) {
                pVectorSpace.get(i).setParentVector(this);
            }
        }
    }


    public VectorData clone() {

        try {
            VectorData newVectorData = new VectorData();
            newVectorData.setId(new String(id));
            newVectorData.setByteCoordinates(getByteCoordinates().clone());
            newVectorData.setDistanceToParent(getDistanceToParent());
            newVectorData.setData(new String(getData().getBytes(StandardCharsets.UTF_8), StandardCharsets.UTF_8));
            if (null != getVectorSpace()) {
                newVectorData.setVectorSpace(getVectorSpace().clone());
            }

            if (isMarked()) {
                newVectorData.setMark();
            }

            return newVectorData;
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }

    }

    public void copy(VectorData pVectorFrom) {

        try {
            setId(new String(pVectorFrom.getId()));
            setByteCoordinates(pVectorFrom.getByteCoordinates().clone());
//			setDistanceToParent(-1f);
            setData(new String(pVectorFrom.getData().getBytes(StandardCharsets.UTF_8), StandardCharsets.UTF_8));
            if (null != pVectorFrom.getVectorSpace()) {
                setVectorSpace(pVectorFrom.getVectorSpace().clone());
            }

            if (pVectorFrom.isMarked()) {
                setMark();
            }
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }

    }


}