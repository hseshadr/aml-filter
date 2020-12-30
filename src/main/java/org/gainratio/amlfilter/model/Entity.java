package org.gainratio.amlfilter.model;

import lombok.Data;
import org.springframework.data.annotation.Id;

import java.time.LocalDate;
import java.util.Set;
import java.util.TreeSet;

@Data
public class Entity {
    @Id
    private String entityCodeInSource = "";
    private String gender = "";
    private String listName;
    private LocalDate entityDate;
    private Set<String> cleanedEntityNames = new TreeSet<String>();
    private Set<LocalDate> dateOfInceptionSet = new TreeSet<>();
    private Set<String> placeOfInceptionSet = new TreeSet<>();
    private Set<String> entityNameSet = new TreeSet<>();
    private Set<String> addressList = new TreeSet<>();
    private Set<String> citizenshipList = new TreeSet<>();
    private Set<String> identificationDocumentList = new TreeSet<>();
    private Set<String> entitySourcesList = new TreeSet<>();

}
