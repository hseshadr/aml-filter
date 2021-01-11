package org.gainratio.amlfilter.model;

import lombok.Builder;
import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.elasticsearch.annotations.Document;
import org.springframework.data.elasticsearch.annotations.Field;
import org.springframework.data.elasticsearch.annotations.FieldType;

import java.util.Set;

@Data
@Builder
@Document(indexName = "namesearch", createIndex = false)
public class EntityCodeAndNames {
    @Id
    private String entityCode;
    private Set<String> nameSet;
}
