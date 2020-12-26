/*
 * Copyright (C) 2010 AMLFilter LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package org.gainratio.amlfilter.search.vectorSpace;

import java.util.Comparator;

/**
 * Comparator for comparing vector results based on cosine values
 *
 * @author Marco Baena
 * @version $Id: VectorResultCosineSimilarityComparator.java,v 1.4 2005/11/28 18:16:57 hseshadr Exp $
 */
public class VectorResultCosineSimilarityComparator implements Comparator {
    // TODO: merge this with the comparison criteria ?
    /*
     * The vector result cosine similaritry comparator instance
     */
    private static VectorResultCosineSimilarityComparator mVectorResultCosineSimilarityComparator;


    /**
     * Get the vector result cosine similaritry comparator singleton instance
     *
     * @return The vector result cosine similaritry comparator singleton instance
     */
    public static VectorResultCosineSimilarityComparator getInstance() {
        if (null == mVectorResultCosineSimilarityComparator) {
            mVectorResultCosineSimilarityComparator = new VectorResultCosineSimilarityComparator();
        }
        return mVectorResultCosineSimilarityComparator;
    }

    /**
     * Compare the vector results based on consine values
     *
     * @param pVectorResult1 The first vector result
     * @param pVectorResult2 The second vector result
     * @return The integer comparison value
     */
    public int compare(Object pVectorResult1, Object pVectorResult2) {
        return Double.compare(((TreeResult) pVectorResult2).similarity, ((TreeResult) pVectorResult1).similarity);
    }
}