package org.gainratio.amlfilter.model;

import lombok.Builder;
import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.elasticsearch.annotations.Document;

import java.util.HashSet;
import java.util.Set;

@Data
@Builder
@Document(indexName = "namesearch", createIndex = false)
public class EntityCodeAndNames {
    @Id
    private String entityCode;
    private Set<String> nameSet;


    public static EntityCodeAndNames buildOne(String pEntityCode, String name) {
        EntityCodeAndNames retObj = new EntityCodeAndNames(null, new HashSet<String>());
        retObj.entityCode = pEntityCode;
        retObj.nameSet = new HashSet<String>();
        retObj.getNameSet().add(name);
        return retObj;
    }

    public String toStringSmall() {
        return entityCode + " : " + nameSet;
    }
}
