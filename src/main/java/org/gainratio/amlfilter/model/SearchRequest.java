package org.gainratio.amlfilter.model;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.Builder;
import lombok.Data;

import java.io.IOException;
import java.util.Arrays;
import java.util.List;

@Data
@Builder
public class SearchRequest {
    private String searchDate;
    private List<SearchRecord> searchRecordList;

    public static void main(String[] args) throws IOException {
        ObjectMapper objectMapper = new ObjectMapper();
        SearchRecord searchRecord1 = SearchRecord.testSearchRecord("Harish Seshadri");
        SearchRecord searchRecord2 = SearchRecord.testSearchRecord("John Smith");
        SearchRequest searchRequest = SearchRequest.builder().searchDate("2020-12-29")
                .searchRecordList(Arrays.asList(searchRecord1, searchRecord2)).build();

        String searchRequestAsJson = objectMapper.writerWithDefaultPrettyPrinter()
                .writeValueAsString(searchRequest);
        System.err.println(searchRequestAsJson);

    }
}
