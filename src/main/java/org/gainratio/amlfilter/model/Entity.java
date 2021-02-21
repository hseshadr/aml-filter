package org.gainratio.amlfilter.model;

import lombok.Data;
import org.springframework.data.annotation.Id;

import java.time.LocalDate;
import java.util.HashSet;
import java.util.Set;

@Data
public class Entity {
    @Id
    private String entityCodeInSource = "";
    private String gender = "";
    private String listName;
    private LocalDate entityDate;
    private Set<String> cleanedEntityNameSet = new HashSet<String>();
    private Set<LocalDate> dateOfInceptionSet = new HashSet<>();
    private Set<String> placeOfInceptionSet = new HashSet<>();
    private Set<String> entityNameSet = new HashSet<>();
    private Set<String> addressList = new HashSet<>();
    private Set<String> citizenshipList = new HashSet<>();
    private Set<String> identificationDocumentList = new HashSet<>();
}
