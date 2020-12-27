

package org.gainratio.amlfilter.algorithms;

import org.apache.commons.codec.language.DoubleMetaphone;
import org.apache.commons.lang3.StringUtils;

/**
 * Text similarity comparator which defines an abstract
 * method called getSimilarity which must be implemented.
 *
 * @author Harish Seshadri
 * @version $Id: DoubleMetaphoneEditDistanceSimilarity.java,v 1.1 2007/01/28 07:13:43 hseshadr Exp $
 */

public class DoubleMetaphoneEditDistanceSimilarity extends SimilarityComparator {
    /**
     * Get the similarity
     *
     * @param pName1 The first name
     * @param pName2 The second name
     * @return The simlarity
     */
    public final float getSimilarity(String pName1, String pName2) {
        DoubleMetaphone dmp = new DoubleMetaphone();

        // TODO: consider make this comparison after the conversion to metaphone. Should speed up since the conversion happens once.
        if (dmp.isDoubleMetaphoneEqual(pName1, pName2)) {
            return 1.0f;
        }

        dmp.setMaxCodeLen(100);
        String name1Phone = dmp.doubleMetaphone(pName1);
        String name2Phone = dmp.doubleMetaphone(pName2);

        if (null == name1Phone || null == name2Phone) {
            return 0f;
        }

        float totalPossibleChanges = Math.max((float) name1Phone.length(), (float) name2Phone.length());

        float editDistance = StringUtils.getLevenshteinDistance(name1Phone, name2Phone);

        return 1.0f - (editDistance / totalPossibleChanges);
    }
}