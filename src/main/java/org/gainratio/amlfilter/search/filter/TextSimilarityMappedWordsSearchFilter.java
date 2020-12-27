
 
package org.gainratio.amlfilter.search.filter;

import lombok.Data;
import org.gainratio.amlfilter.model.Result;
import org.gainratio.amlfilter.service.AlgorithmsService;
import org.gainratio.amlfilter.service.ResultsService;
import org.gainratio.amlfilter.service.SearchResultAnalyzerService;
import org.gainratio.amlfilter.service.SynonymService;

import java.util.Iterator;
import java.util.List;
import java.util.Map;

/**
 * The text similarity mapped words search filter
 */
@Data
public class TextSimilarityMappedWordsSearchFilter  implements NameSearchFilter
{
    private SearchResultAnalyzerService searchResultAnalyzerService;

    public void filterSearchResults(List<Result> pSearchResults, Map pParametersMap) throws Exception
    {
        String searchName = null;
        Iterator<Result> resultsIterator = pSearchResults.iterator();
        while (resultsIterator.hasNext())
        {
            Result result = (Result) resultsIterator.next();
            String blmName = result.getResultName();
            searchName = result.getSearchName();
            boolean matchFound = getSearchResultAnalyzerService().doesResultMatch(searchName, blmName, result, pParametersMap);

            if (!matchFound)
            {
                resultsIterator.remove();
            }
        }
    }
}