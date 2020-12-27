package org.gainratio.amlfilter.search;


import org.gainratio.amlfilter.model.Result;

import java.util.List;
import java.util.Map;

public interface SearchInterface {
    /**
     * Searches for a name in the watchlist.
     * This is done by invoking all the search components
     * registered and invoking one by one, gathering the
     * results and then merging them.
     */
    List<Result> searchForNameInWatchList(String pNameToSearch, Map pParametersMap) throws Exception;

}