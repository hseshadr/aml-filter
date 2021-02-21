package org.gainratio.amlfilter.model;

import lombok.Getter;
import org.springframework.context.ApplicationEvent;

@Getter
public class GenericEvent extends ApplicationEvent {
    public enum EventType {
        LOADER,
        GENERATE_VECTORS
    }

    private EventType eventType;

    public GenericEvent(EventType eventType, Object source) {
        super(source);
        this.eventType = eventType;
    }
}
