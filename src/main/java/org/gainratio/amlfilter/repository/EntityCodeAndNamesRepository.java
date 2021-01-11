package org.gainratio.amlfilter.repository;

import org.gainratio.amlfilter.model.EntityCodeAndNames;
import org.springframework.data.elasticsearch.annotations.Query;
import org.springframework.data.elasticsearch.core.SearchHits;
import org.springframework.data.elasticsearch.repository.ElasticsearchRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface EntityCodeAndNamesRepository extends ElasticsearchRepository<EntityCodeAndNames, String> {
    @Query("{\n" +
            "    \"multi_match\": {\n" +
            "      \"query\": \"?0\",\n" +
            "      \"fuzziness\": ?1,\n" +
            "      \"fields\": [\n" +
            "        \"nameSet\",\n" +
            "        \"nameSet.exact\",\n" +
            "        \"nameSet.metaphone\"\n" +
            "      ],\n" +
            "      \"type\": \"most_fields\"\n" +
            "    }\n" +
            "  }")
    SearchHits<EntityCodeAndNames> findName(String name, int fuzziness);
}
