package org.gainratio.amlfilter.model;

import lombok.Data;

import javax.persistence.Entity;
import javax.persistence.GeneratedValue;
import javax.persistence.Id;

@Data
@Entity
public class Word {
    @Id
    @GeneratedValue
    private Long id;
    private String word;
    private Integer numTimesFound;
}
