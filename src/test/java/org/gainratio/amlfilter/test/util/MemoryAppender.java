package org.gainratio.amlfilter.test.util;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;

import java.util.Optional;

public class MemoryAppender extends ListAppender<ILoggingEvent> {

    public void reset() {
        this.list.clear();
    }

    public boolean contains(String msg) {
        return this.list.stream()
                .anyMatch(event -> event.getFormattedMessage().contains(msg));
    }

    public boolean hasErrors() {
        return this.list.stream()
                .anyMatch(event -> event.getLevel().equals(Level.ERROR));
    }

    public boolean hasError(String errMsg) {
        return this.list.stream()
                .anyMatch(event -> event.getLevel().equals(Level.ERROR)
                        && (event.getFormattedMessage().contains(errMsg)
                        || Optional.ofNullable(event.getThrowableProxy())
                        .map(t -> t.getMessage())
                        .filter(t -> t.contains(errMsg))
                        .isPresent()));
    }

    public boolean hasWarnings() {
        return this.list.stream()
                .anyMatch(event -> event.getLevel().equals(Level.WARN));
    }
}