package org.gainratio.amlfilter.service;

import lombok.Data;

@Data
public class GenericEvent<T> {
    private T event;

    public GenericEvent(T event) {
        this.event = event;
    }
}
