package org.gainratio.amlfilter.loader;

import lombok.Builder;
import lombok.Data;

import java.time.LocalDate;
import java.util.List;

@Data
@Builder
public class LoaderInfo {
    private List<ListInfo> listInfoList;
    private LocalDate loadedDate;
}
