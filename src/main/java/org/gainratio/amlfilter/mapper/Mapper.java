package org.gainratio.amlfilter.mapper;

public interface Mapper<I, O> {
    O map(I input);
}
