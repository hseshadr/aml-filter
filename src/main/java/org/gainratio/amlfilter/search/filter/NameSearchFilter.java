
 
package org.gainratio.amlfilter.search.filter;

import java.util.List;
import java.util.Map;

import org.gainratio.amlfilter.model.Result;

public interface NameSearchFilter
{
	void filterSearchResults(List<Result> pSearchResults, Map pParametersMap) throws Exception;
}