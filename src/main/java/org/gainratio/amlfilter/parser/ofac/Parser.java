package org.gainratio.amlfilter.parser.ofac;

public interface Parser<T> {
    T parse() throws Exception;
}
