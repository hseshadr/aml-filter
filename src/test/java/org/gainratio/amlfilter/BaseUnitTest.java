package org.gainratio.amlfilter;

import ch.qos.logback.classic.Logger;
import org.gainratio.amlfilter.test.util.MemoryAppender;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.mockito.MockitoAnnotations;
import org.slf4j.LoggerFactory;

@Tag("unit")
public abstract class BaseUnitTest {
    private MemoryAppender logAppender = null;

    @BeforeEach
    public void initMocks() {
        // all @Mock and @Spy annotated objects should have a clean state so no need to reset.
        MockitoAnnotations.initMocks(this);
    }

    protected void attachLogAppender() {
        logAppender = new MemoryAppender();
        Logger root = (Logger) LoggerFactory.getLogger(Logger.ROOT_LOGGER_NAME);
        root.addAppender(logAppender);
        logAppender.start();
    }

    protected void detachLogAppender() {
        if (logAppender != null) {
            Logger root = (Logger) LoggerFactory.getLogger(Logger.ROOT_LOGGER_NAME);
            root.detachAppender(logAppender);
        }
    }

    /**
     * for flexibility this supports partial match, so can use a keyword instead of whole message.
     */
    protected void verifyLogMessage(String msg) {
        Assertions.assertTrue(logAppender.contains(msg));
    }

    protected void verifyNoLogMessage(String msg) {
        Assertions.assertFalse(logAppender.contains(msg));
    }

    protected void verifyLogHasNoErrors() {
        Assertions.assertFalse(logAppender.hasErrors());
    }

    protected void verifyLogHasError(String errMsg) {
        Assertions.assertTrue(logAppender.hasError(errMsg));
    }

    protected void verifyLogHasNoWarnings() {
        Assertions.assertFalse(logAppender.hasWarnings());
    }

    @AfterEach
    public void commonCleanup() {
        detachLogAppender();
    }
}
