package org.gainratio.amlfilter.model;

import lombok.Data;

import java.util.HashSet;
import java.util.Set;

@Data
public class SearchRecord {
    private String uniqueId;
    private String fullName;
    private String entityType;
    private String gender;
    private float nameInformationLevel = 10f;
    private String cleanedSearchName;

    private Set<String> placeOfInceptionSet = new HashSet<String>();
    private Set<String> dateOfInceptionSet = new HashSet<String>();
    private Set<String> identificationDocumentSet = new HashSet<String>();
    private Set<String> addressSet = new HashSet<String>();
    private Set<String> citizenshipSet = new HashSet<String>();

}
