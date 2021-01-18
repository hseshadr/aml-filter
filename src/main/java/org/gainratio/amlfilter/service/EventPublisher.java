package org.gainratio.amlfilter.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;

@Component
public class EventPublisher<T> {
    @Autowired
    private ApplicationEventPublisher applicationEventPublisher;

    public void publishCustomEvent(GenericEvent<T> event) {
        applicationEventPublisher.publishEvent(event);
    }
}