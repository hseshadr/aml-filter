/*
 * Copyright (C) 2010 AMLFilter LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package org.gainratio.amlfilter.util;

/**
 * Contains general constants that come in handy
 *
 * @author Harish Seshadri
 * @version $Id: GeneralConstants.java,v 1.1 2007/01/28 07:13:37 hseshadr Exp $
 */

public interface GeneralConstants {
    /**
     * Class instantiation failed identifier
     */
    String CLASS_INSTANTIATION_FAILED = "Class instantiation failed: ";

    /**
     * Could not create the class object identifier
     */
    String NO_CLASS_OBJECT = "Could not create the class object: ";

    /**
     * Error message indicating that the string to escape was not provided
     */
    String NO_STRING_TO_ESCAPE = "The string to escape was not provided: ";

    /**
     * Error message indicating that the class name was not provided
     */
    String NO_CLASS_NAME = "The class name was not provided: ";

    /**
     * Error message indicating that the class package name was not provided
     */
    String NO_CLASS_PACKAGE_NAME = "The class package name was not provided: ";

    /**
     * Error message indicating that the throwable object was not provided
     */
    String NO_THROWABLE_OBJECT = "The throwable object was not provided: ";

    /**
     * Error message indicating that the byte array was not provided
     */
    String NO_BYTE_ARRAY = "The byte array was not provided: ";

    /**
     * Error message indicating that the file name with extension was not provided
     */
    String NO_FILE_NAME_WITH_EXT = "The file name with extension was not provided: ";

    /**
     * Error message indicating that the formatting pattern was not provided
     */
    String NO_FORMATTING_PATTERN = "The formatting pattern was not provided: ";

    /**
     * Error message indicating that the formatting arguments were not provided
     */
    String NO_FORMATTING_ARGUMENTS = "The formatting arguments were not provided: ";

    /**
     * Error message indicating that the root path was not provided
     */
    String NO_ROOT_PATH = "The root path was not provided: ";

    /**
     * Error message indicating that the relative path was not provided
     */
    String NO_RELATIVE_PATH = "The relative path was not provided: ";

    /**
     * Error message indicating that the delimiter was not provided
     */
    String NO_DELIMITER = "The delimiter was not provided: ";

    /**
     * Not known string used in some data files.
     */
    String NOT_KNOWN = "NOTK";

    /**
     * Not known string used in some data files.
     */
    String NOT_KNOWN_FULL_STRING = "Not Known";

    /**
     * Bad method params
     */
    String BAD_METHOD_PARAMS = "Bad method params: ";

    /**
     * Method params are null
     */
    String METHOD_PARAMS_NULL = "Method params are null: ";

    /**
     * The method start
     */
    String METHOD_START = "Method Start: ";

    /**
     * The method end
     */
    String METHOD_END = "Method End: ";

    /**
     * The class identifier
     */
    String CLASS = "Class: ";

    /**
     * The method
     */
    String METHOD = "Method: ";

    /**
     * The object is not serializable
     */
    String OBJECT_NOT_SERIALIZABLE = "Object is not serializable";

    /**
     * The "started" message
     */
    String STARTED = "STARTED";

    /**
     * The "stopped" message
     */
    String STOPPED = "STOPPED";

    /**
     * The "starting" message
     */
    String STARTING = "STARTING";

    /**
     * The "stopping" message
     */
    String STOPPING = "STOPPING";

    /**
     * The request is corrupt
     */
    String REQUEST_IS_CORRUPT = "Request is corrupt";

    /**
     * The response is corrupt
     */
    String RESPONSE_IS_CORRUPT = "Response is corrupt";

    /**
     * The colection type is a set
     */
    int COLLECTION_TYPE_SET = 3500;

    /**
     * The colection type is a list
     */
    int COLLECTION_TYPE_LIST = 3501;

    /**
     * The colection type is a vector
     */
    int COLLECTION_TYPE_VECTOR = 3502;

    /**
     * The colection type is a vector
     */
    int COLLECTION_TYPE_DEFAULT = 3503;

    /**
     * One kilo byte as bytes
     */
    int ONE_KB_AS_BYTES = 1024;

    /**
     * The HTML escape prefix
     */
    String HTML_ESCAPE_PREFIX = "&";

    /**
     * The HTML escape prefix with numeric code
     */
    String HTML_ESCAPE_PREFIX_WITH_NUMERIC_CODE = "&#";

    /**
     * The HTML escape suffix
     */
    String HTML_ESCAPE_SUFFIX = ";";

    /**
     * The XML extension
     */
    String XML_EXTENSION = ".xml";

    /**
     * Commiting
     */
    String COMMITING = "COMMITING";

    /**
     * Rolling back
     */
    String ROLLING_BACK = "ROLLING BACK";

    /**
     * Error
     */
    String ERROR = "ERROR";

    /**
     * EMPTY
     */
    String EMPTY = "EMPTY";

    /**
     * The escaped ampersand
     */
    String AMP_ESCAPE = "&amp;";

    /**
     * The file separator property name
     */
    String FILE_SEPARATOR_PROPERTY_NAME = "file.separator";

    /**
     * The line separator property name
     */
    String LINE_SEPARATOR_PROPERTY_NAME = "line.separator";

    /**
     * AMLF tab format separator
     */
    String AMLF_TAB_FORMAT_SEPARATOR = "\t--\t";

    /**
     * Undefined token
     */
    String UNDEFINED_TOKEN = "U";

    /**
     * Ampersand token
     */
    String AMPERSAND_TOKEN = "&";

    /**
     * Empty string
     */
    String EMPTY_TOKEN = "";

    /**
     * Space token
     */
    String SPACE_TOKEN = " ";

    /**
     * Space token
     */
    String SPACE_TOKEN_X3 = "   ";

    /**
     * Space token
     */
    String SPACE_TOKEN_X5 = "     ";

    /**
     * Comma token
     */
    String COMMA_TOKEN = ",";

    /**
     * Period / dot token
     */
    String PERIOD_TOKEN = "\\.";

    /**
     * Semi-colon token
     */
    String SEMI_COLON_TOKEN = ";";

    /**
     * Tab token
     */
    String TAB_TOKEN = "\t";

    /**
     * New line token
     */
    String NEW_LINE_TOKEN = "\n";

    /**
     * Carriage return new line token
     */
    String CARRIAGE_RETURN_NEW_LINE_TOKEN = "\r\n";

    /**
     * The comment token
     */
    String COMMENT_TOKEN = "###";

    /**
     * The forward slash token
     */
    String FORWARD_SLASH_TOKEN = "/";

    /**
     * The back slash token
     */
    String BACK_SLASH_TOKEN = "\\";

    /**
     * The underscore token
     */
    String UNDERSCORE_TOKEN = "_";

    /**
     * The colon token
     */
    String COLON_TOKEN = ":";

    /**
     * The open parenthesis token
     */
    String OPEN_PARENTHESIS_TOKEN = "(";

    /**
     * The close parenthesis token
     */
    String CLOSE_PARENTHESIS_TOKEN = ")";

    /**
     * The question token
     */
    String QUESTION_TOKEN = "?";

    /**
     * UTF-8
     */
    String UTF8 = "UTF-8";

    /**
     * Male token
     */
    String MALE = "Male";

    /**
     * Female token
     */
    String FEMALE = "Female";

    /**
     * Person token
     */
    String PERSON = "Person";

    /**
     * Entity token
     */
    String ENTITY = "Entity";

    /**
     * Digits
     */
    String DIGITS = "0123456789";

    /**
     * Blocking char pairs.
     * The even positions are the block-starting tag (starts at 0), and the odd ones are the block-closing ones.
     */
    String BLOCK_DEFINING_CHAR_PAIRS = "()[]{}<>";

    /**
     * Block starting chars.
     */
    String BLOCK_STARTING_CHARS = "([{<";

    /**
     * Block ending chars.
     */
    String BLOCK_ENDING_CHARS = ")]}>";

    /**
     * Zero token
     */
    String ZERO = "0";

    /**
     * One token
     */
    String ONE = "1";

    /**
     * Underscore
     */
    String UNDERSCORE = "_";

//    /**
//     * Slash 
//     */
//    public final static String SLASH = "/";

    /**
     * Primary name
     * Used for identification of names to be used for name variations
     */
    String PRIMARY_NAME = "Primary Name";

    /**
     * Record action: ADD
     */
    String RECORD_ACTION_ADD = "ADD";

    /**
     * Record action: CHANGE (UPDATE)
     */
    String RECORD_ACTION_CHANGE = "CHG";

    /**
     * Record action: DELETE
     */
    String RECORD_ACTION_DELETE = "DEL";

    String AMLFILTER_CRLF = "-!AMLF_CR!-";

    String TOKEN_SEPARATOR = "\t&\t";

    String ENTITY_ADD_ACTION = "ADD";
    String ENTITY_CHG_ACTION = "CHG";
    String ENTITY_DEL_ACTION = "DEL";

    String FACTIVA_LIST_NAME = "FCT";

    String LOAD_TYPE_FULL = "FULL_LOAD";
    String LOAD_TYPE_INCREMENTAL = "INCREMENTAL_LOAD";

    String ANALYTIC_RECORDS_SEPARATOR_TOKEN = "\t#--#\t";

    String AMLFILTER_HOME = "AMLFILTER_HOME";


    String ADMIN_LOG_TASK__LOAD_LISTS = "LOAD_LISTS";
    String ADMIN_LOG_TASK__EDIT_ENTITY_SOURCES = "EDIT_ENTITY_SOURCES";
}


