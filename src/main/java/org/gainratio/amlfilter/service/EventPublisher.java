package org.gainratio.amlfilter.service;

import lombok.AllArgsConstructor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;

@Component
@AllArgsConstructor
public class EventPublisher<T> {
    private ApplicationEventPublisher applicationEventPublisher;

    public void publishEvent(GenericEvent<T> event) {
        applicationEventPublisher.publishEvent(event);
    }
}