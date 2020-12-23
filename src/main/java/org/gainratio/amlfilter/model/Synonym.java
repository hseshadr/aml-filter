package org.gainratio.amlfilter.model;

import lombok.Data;

import javax.persistence.Entity;
import javax.persistence.GeneratedValue;
import javax.persistence.Id;

@Data
@Entity
public class Synonym {
    @Id
    @GeneratedValue
    private Long id;
    private String word;
    private String synonym;
}
