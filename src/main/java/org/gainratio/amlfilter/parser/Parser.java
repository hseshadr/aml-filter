package org.gainratio.amlfilter.parser;

public interface Parser<T> {
    T parse() throws Exception;
}
