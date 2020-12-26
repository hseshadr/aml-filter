package org.gainratio.amlfilter.util;

import java.text.DateFormat;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * The purpose of this class is to provide
 * some general purpose utility functions
 * for date/calendar manipulation
 */

public class DateUtils implements GeneralConstants {
    public static Date convertStringDateToDate(String pDateString,
                                               String pDateFormat)
            throws ParseException {
        DateFormat format = new SimpleDateFormat(pDateFormat, Locale.US);
        try {
            Date date = format.parse(pDateString);
            return date;
        } catch (ParseException pe) {
            throw pe;
        }
    }
}

