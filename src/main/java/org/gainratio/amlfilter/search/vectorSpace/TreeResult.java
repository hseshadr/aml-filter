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

import lombok.Data;

@Data
public class TreeResult {
    public String searchName;
    public int positionInResultsList = -1;
    public int positionInVectorList = -1;
    public double similarity = 0;
    public float pairSimilarity = -1;
    public VectorData4Tree foundVectorData = null;
    public boolean mark = false;
    public VectorData4Tree parent = null;


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