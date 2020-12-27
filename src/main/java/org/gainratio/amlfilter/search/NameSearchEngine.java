
 
package org.gainratio.amlfilter.search;

import lombok.Data;
import org.gainratio.amlfilter.model.Result;
import org.gainratio.amlfilter.service.ResultsServiceInterface;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

/**
 * The name search engine performs the following tasks:
 * - Search for name(s) in a blacklist
 * It essentially functions by calling search components
 * to gather and merge the results and then a bunch of
 * filters to filter out only relevant results.
 */
@Data
@Component
public class NameSearchEngine
{
    private ResultsServiceInterface resultsService;
    private List<NameSearch> nameSearchComponents = new ArrayList<NameSearch>();

    /**
     * Searches for a client in a blacklist.
     * This is done by invoking all the search components
     * registered and invoking one by one, gathering the
     * results and then merging them.
     * @throws Exception
     */
    public List<Result> searchForNameInWatchList(String pNameToSearch,
                                                   Map pParametersMap)
                                                   throws Exception
    {
        final String methodSignature = "List<Result> searchForNameInWatchList(String, Map): ";
        Iterator<NameSearch> nameSearchComponentsIterator = getNameSearchComponents().iterator();
        List<Result> cumulativeResults = new ArrayList<Result>();
        List<Result> results = null;
		// Iterate through all name search components and execute the search
		while (nameSearchComponentsIterator.hasNext())
		{
			NameSearch nameSearchComponent = (NameSearch) nameSearchComponentsIterator.next();
			results = nameSearchComponent.executeNameSearch(pParametersMap);
			cumulativeResults.addAll(results);
		}

		if (cumulativeResults.size() > 0)
		{
			// Remove the result repetitions from multiple searches
			// *******************************************************************
			cumulativeResults = getResultsService().removeResultRepetitionsByNameAndSimilarity(cumulativeResults);

			// Remove the result repetitions by entity code and similarity
			cumulativeResults = getResultsService().removeResultRepetitionsByEntityCodeAndSimilarity(cumulativeResults);
			// Remove the result synonyms
			// *******************************************************************
			cumulativeResults = getResultsService().removeResultSynonyms(cumulativeResults);
		}
		// Finally return the results
		return cumulativeResults;
    }
}