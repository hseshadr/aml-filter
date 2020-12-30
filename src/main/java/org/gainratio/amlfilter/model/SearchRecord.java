package org.gainratio.amlfilter.model;

import lombok.Builder;
import lombok.Data;

import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

@Data
@Builder
public class SearchRecord {
    private final String uniqueId;
    private final String fullName;
    private final String entityType;
    private final Set<String> placeOfInceptionSet = new HashSet<String>();
    private final Set<String> dateOfInceptionSet = new HashSet<String>();
    private final Set<String> identificationDocumentSet = new HashSet<String>();
    private final Set<String> addressSet = new HashSet<String>();
    private final Set<String> citizenshipSet = new HashSet<String>();
    private String gender;

    public static SearchRecord testSearchRecord(String fullName) {
        return SearchRecord.builder()
                .uniqueId(UUID.randomUUID().toString())
                .fullName(fullName)
                .entityType("SOME_ENTITY_TYPE")
                .gender("Male").build();
    }
}


