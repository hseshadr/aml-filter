package org.gainratio.amlfilter.search;

import org.gainratio.amlfilter.exception.AMLFException;

public class EmptySearchNameException extends AMLFException {
    public EmptySearchNameException(String pMessage, String pErrorCode) {
        super(pMessage, pErrorCode);
    }
}