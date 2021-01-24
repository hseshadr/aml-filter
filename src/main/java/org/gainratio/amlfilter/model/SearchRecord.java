package org.gainratio.amlfilter.model;

import lombok.Builder;
import lombok.Data;

import java.util.Set;

@Data
@Builder
public class SearchRecord {
    private String uniqueId;
    private String fullName;
    private String entityType;
    private String cleanedName;
    private String synonimicName;
    private Set<String> placeOfInceptionSet;
    private Set<String> dateOfInceptionSet;
    private Set<String> identificationDocumentSet;
    private Set<String> addressSet;
    private Set<String> citizenshipSet;
    private String gender;
}


