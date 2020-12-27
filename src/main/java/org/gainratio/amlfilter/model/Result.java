
package org.gainratio.amlfilter.model;

import lombok.Data;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

@Data
public class Result
{
    private String description = "";
    private String uncleanedSearchName;
    private String searchName;
    private String resultName;
    private String resultDescription;
    private String entityCodeInSource;
    private String listName;
    private Float textSimilarity = -1f;
    private Long hitTime = -1L;
    private SearchRecord searchRecord = new SearchRecord();
    private Float resultNameInformationLevel = 10f;
    private List<String> entitySourceList = new ArrayList<String>();
    private String searchId;

    public String getSearchId() {
    	if (null == searchId) {
    		searchId = getSearchRecord().getUniqueId();
    	}
    	return searchId;
    }
}