

package org.gainratio.amlfilter.algorithms;

import org.apache.commons.lang3.StringUtils;

/**
 * Text similarity comparator which defines an abstract
 * method called getSimilarity which must be implemented.
 *
 * @author Harish Seshadri
 * @version $Id: EditDistanceSimilarity.java,v 1.1 2007/01/28 07:13:42 hseshadr Exp $
 */

public class EditDistanceSimilarity extends SimilarityComparator {
    /**
     *
     */
    private static final long serialVersionUID = -5956566091500793257L;

    /**
     * int DamerauLevenshteinDistance(char str1[1..lenStr1], char str2[1..lenStr2])
     * // d is a table with lenStr1+1 rows and lenStr2+1 columns
     * declare int d[0..lenStr1, 0..lenStr2]
     * // i and j are used to iterate over str1 and str2
     * declare int i, j, cost
     * <p>
     * for i from 0 to lenStr1
     * d[i, 0] := i
     * for j from 1 to lenStr2
     * d[0, j] := j
     * <p>
     * for i from 1 to lenStr1
     * for j from 1 to lenStr2
     * if str1[i] = str2[j] then cost := 0
     * else cost := 1
     * d[i, j] := minimum(
     * d[i-1, j  ] + 1,     // deletion
     * d[i  , j-1] + 1,     // insertion
     * d[i-1, j-1] + cost   // substitution
     * )
     * if(i > 1 and j > 1 and str1[i-1] = str2[j-2] and str1[i-2] = str2[j-1]) then
     * d[i, j] := minimum(
     * d[i, j],
     * d[i-2, j-2] + cost   // transposition
     * )
     * return d[lenStr1, lenStr2]
     */
    public static int getDamerauLevenshteinDistance(String pName1, String pName2) {
        char[] name1Chars = pName1.toCharArray();
        char[] name2Chars = pName2.toCharArray();

        int name1StrLength = name1Chars.length;
        int name2StrLength = name2Chars.length;

        int[][] d = new int[name1StrLength + 1][name2StrLength + 1];
        int i, j, cost, min = 0, delVal = 0, insVal = 0, subsVal = 0;


        for (i = 0; i <= name1StrLength; i++) {
            d[i][0] = i;
        }
        for (j = 1; j <= name2StrLength; j++) {
            d[0][j] = j;
        }

        for (i = 1; i <= name1StrLength; i++) {
            for (j = 1; j <= name2StrLength; j++) {
                if (name1Chars[i - 1] == name2Chars[j - 1]) {
                    cost = 0;
                } else {
                    cost = 1;
                }

                // Deletion
                delVal = d[i - 1][j] + 1;
                // insertion
                insVal = d[i][j - 1] + 1;
                // substitution
                subsVal = d[i - 1][j - 1] + cost;

                min = delVal;
                if (insVal < min) {
                    min = insVal;
                }
                if (subsVal < min) {
                    min = subsVal;
                }


                d[i][j] = min;

                if (i > 1 && j > 1 && name1Chars[i - 1] == name2Chars[j - 2] && name1Chars[i - 2] == name2Chars[j - 1]) {
                    d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + cost);   // transposition
                }
            }
        }

        return d[name1StrLength][name2StrLength];
    }

    public static int damlev(String s, String t) /* never tested! */ {
        int l1 = s.length();
        int l2 = t.length();
        int n = l1 + 1;
        int m = l2 + 1;
        if (m == 1)
            return n - 1;
        if (n == 1)
            return m - 1;
        int[] d = new int[m * n];
        int k = 0;
        for (int i = 0; i < n; i++)
            d[i] = i;
        k = n;
        for (int i = 1; i < m; i++) {
            d[k] = i;
            k += n;
        }
        int f = 0, g = 0, h = 0, min = 0, b = 0, c = 0, cost = 0, tr = 0;
        for (int i = 1; i < n; i++) {
            k = i;
            f = 0;
            for (int j = 1; j < m; j++) {
                h = k;
                k += n;
                min = d[h] + 1;
                b = d[k - 1] + 1;
                if (g < l1 && f < l2)
                    if (s.charAt(g) == t.charAt(f))
                        cost = 0;
                    else {
                        cost = 1;
                        /* Sean's transposition */
                        if (j < l2 && i < l1)
                            if (s.charAt(i) == t.charAt(f) && s.charAt(g) == t.charAt(j)) {
                                tr = d[(h) - 1]/* + 1*/; // transposition yields deletion cost at next iteration?
                                if (tr < min)
                                    min = tr;
                            }
                    }
                else
                    cost = 1;
                c = d[h - 1] + cost;
                if (b < min)
                    min = b;
                if (c < min)
                    min = c;
                d[k] = min;
				/*
				System.out.println("i=" + i + ", j=" + j);
				for (int v = 0; v < m; v++)
				{
					for (int w = 0; w < n; w++)
						System.out.print(d[v * n + w] + " ");
					System.out.println();
				}
				*/
                f = j;
            }
            g = i;
        }
        return d[k];
    }

    public static void main(String[] args) {
        String name1 = "JONES SESHADRI JIMENEZ";
        String name2 = "OJNSE SESAHDRI JIMENEZ";

        EditDistanceSimilarity eds = new EditDistanceSimilarity();
        double totalTimeLevenshtein = 0;
        double totalTimeDamerau = 0;
        int levenshteinEditDistance = 0;
        int damerauEditDistance = 0;
        double numIterations = 100000f;
        for (int i = 0; i < numIterations; i++) {
            float startTime = System.nanoTime();
            levenshteinEditDistance = StringUtils.getLevenshteinDistance(name1, name2);
            float endTime = System.nanoTime();
            totalTimeLevenshtein += endTime - startTime;

            startTime = System.nanoTime();
            damerauEditDistance = EditDistanceSimilarity.getDamerauLevenshteinDistance(name1, name2);
            endTime = System.nanoTime();
            totalTimeDamerau += endTime - startTime;

        }
        System.out.println("getLevenshteinDistance: " + levenshteinEditDistance);
        System.out.println("getDamerauLevenshteinDistance: " + damerauEditDistance);
        System.out.println();
        System.out.println("getLevenshteinDistance averageTime: " + (totalTimeLevenshtein / numIterations / 1000000d));
        System.out.println("getDamerauLevenshteinDistance averageTime: " + (totalTimeDamerau / numIterations / 1000000d));


    }

    /**
     * Get the similarity
     *
     * @param pName1 The first name
     * @param pName2 The second name
     * @return The simlarity
     */
    public float getSimilarity(String pName1, String pName2) {
        float totalPossibleChanges = Math.max((float) pName1.length(), (float) pName2.length());
        float editDistance = getDamerauLevenshteinDistance(pName1, pName2);
        return 1.0f - (editDistance / totalPossibleChanges);
    }
}