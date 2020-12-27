package org.gainratio.amlfilter.search;


import lombok.Data;
import org.gainratio.amlfilter.model.Result;
import org.gainratio.amlfilter.search.filter.NameSearchFilter;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

@Data
public abstract class NameSearch {
    private List<NameSearchFilter> nameSearchFilterComponents = new ArrayList<NameSearchFilter>();

    public abstract List<Result> executeQuery(Map pParametersMap) throws Exception;

    public List<Result> executeNameSearch(Map pParametersMap) throws Exception {
        final String methodSignature = "List executeNameSearch(Map): ";

        // Execute the query
        List<Result> results = executeQuery(pParametersMap);

        // Get the name search components iterator
        Iterator nameSearchFilterComponentsIterator = getNameSearchFilterComponents().iterator();

        // Iterate through all name search components
        while (nameSearchFilterComponentsIterator.hasNext()) {
            // Get each name search filter component
            NameSearchFilter nameSearchFilterComponent = (NameSearchFilter) nameSearchFilterComponentsIterator.next();

            // Invoke the filter
            nameSearchFilterComponent.filterSearchResults(results, pParametersMap);
        }

        // Return the final results objects
        return results;
    }
}