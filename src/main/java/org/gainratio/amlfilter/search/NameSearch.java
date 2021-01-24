package org.gainratio.amlfilter.search;


import lombok.Data;
import org.gainratio.amlfilter.model.Result;
import org.gainratio.amlfilter.model.SearchRecord;
import org.gainratio.amlfilter.vector.filter.NameSearchFilter;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;

@Data
public abstract class NameSearch {
    private List<NameSearchFilter> nameSearchFilterComponents = new ArrayList<NameSearchFilter>();

    public abstract List<Result> executeQuery(SearchRecord searchRecord);

    public List<Result> executeNameSearch(SearchRecord searchRecord) {
        final String methodSignature = "List executeNameSearch(Map): ";

        // Execute the query
        List<Result> results = executeQuery(searchRecord);

        // Get the name search components iterator
        Iterator nameSearchFilterComponentsIterator = getNameSearchFilterComponents().iterator();

        // Iterate through all name search components
        while (nameSearchFilterComponentsIterator.hasNext()) {
            // Get each name search filter component
            NameSearchFilter nameSearchFilterComponent = (NameSearchFilter) nameSearchFilterComponentsIterator.next();

            // Invoke the filter
            nameSearchFilterComponent.filterSearchResults(results);
        }

        // Return the final results objects
        return results;
    }
}