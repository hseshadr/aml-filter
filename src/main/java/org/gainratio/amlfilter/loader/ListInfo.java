package org.gainratio.amlfilter.loader;

import lombok.Builder;
import lombok.Data;

import java.time.LocalDate;

@Data
@Builder
public class ListInfo {
    private String listName;
    private int numberOfRecords;
    private LocalDate loadedDate;
}
