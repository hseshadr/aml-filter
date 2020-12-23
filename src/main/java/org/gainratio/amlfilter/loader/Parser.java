package org.gainratio.amlfilter.loader;

public interface Parser<T> {
    T parse() throws Exception;
}
