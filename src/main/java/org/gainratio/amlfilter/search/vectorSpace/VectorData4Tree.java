package org.gainratio.amlfilter.search.vectorSpace;

import lombok.Data;

import java.io.Serializable;
import java.nio.charset.StandardCharsets;


/**
 * This class holds a basic vector definition
 */
@Data
public class VectorData4Tree implements Serializable {
    private static final long serialVersionUID = 2691187260635546600L;
    /*
     * The mark to operate on the data
     */
    public boolean mark = false;
    private byte[] byteCoordinates;
    /*
     * The possible parent vector. Applicable only on a tree structure
     */
    private VectorData4Tree parentVector;
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


    public VectorData4Tree clone() {

        try {
            VectorData4Tree newVectorData = new VectorData4Tree();

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

    public void copy(VectorData4Tree pVectorFrom) {

        try {
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