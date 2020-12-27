package org.gainratio.amlfilter.search;

import org.gainratio.amlfilter.exception.AMLFException;

public class EmptyUniqueIdException extends AMLFException
{
	public EmptyUniqueIdException(String pMessage, String pErrorCode)
	{
		super(pMessage, pErrorCode);
	}
}