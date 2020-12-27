
package org.gainratio.amlfilter.model;

import lombok.Data;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

@Data
public class SearchRequest
{
	private Long hitTime;
	private Long totalTime;
	private String remoteAddr;
	private String remoteHost;
    private List<SearchRecord> mSearchRecordList = new ArrayList<SearchRecord>();

}
