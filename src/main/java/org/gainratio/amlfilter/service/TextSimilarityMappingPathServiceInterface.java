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

package org.gainratio.amlfilter.service;


/**
 * @author Marco Baena
 */
public interface TextSimilarityMappingPathServiceInterface {
    /**
     * Get the text similarity mapping path for two text strings passed in
     *
     * @param pSearchName    The search name
     * @param pBlackListName The blsck list name
     * @return The text similarity mapping path
     */
    TextSimilarityMappingPath getTextSimilarityMappingPath(String pSearchName, String pBlackListName);

    /**
     * Get the text similarity (%) for two text strings passed in
     *
     * @param pSearchName    The search name
     * @param pBlackListName The blsck list name
     * @return The text similarity in a float
     */
    float getTextSimilarity(String pSearchName, String pBlackListName);

}