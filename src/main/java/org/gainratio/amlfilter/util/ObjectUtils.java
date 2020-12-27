

package org.gainratio.amlfilter.util;

import java.io.*;

/**
 * The purpose of this class is to provide
 * some general purpose utility functions
 *
 * @author Harish Seshadri
 * @version $Id: ObjectUtils.java,v 1.1 2007/01/28 07:13:38 hseshadr Exp $
 */

public class ObjectUtils implements GeneralConstants {
    /**
     * This method serializes an object and
     * writes it out to a byte array output stream
     * Then it returns the stream it wrote to
     *
     * @param pObjectToSerialize The object to persist
     * @return The serialized object as a stream
     * @throws Exception
     */
    public static ByteArrayOutputStream serialize_ObjectToStream(Object pObjectToSerialize) throws Exception {
        // In order to bullet proof this method we should check to
        // see if the file name and the object to persist exists
        if (null == pObjectToSerialize) {
            // Throw an exception indicating the fact
            throw (new Exception("Method params null"));

        }

        // Check to see if the object passed in is even
        // serializable. If it is not then throw an exception
        if (!(pObjectToSerialize instanceof Serializable)) {
            // Throw an exception indicating the fact
            throw (new Exception("Object Not serializable"));
        }

        // Create a byte array output stream
        ByteArrayOutputStream byteArrayOutputStream = new ByteArrayOutputStream();

        // Create an object output stream
        ObjectOutputStream objectOutputStream = new ObjectOutputStream(byteArrayOutputStream);

        // Try-finally block to perform the persisting
        try {
            // Write the object out to the output stream
            objectOutputStream.writeObject(pObjectToSerialize);

            // Flush out the stream
            objectOutputStream.flush();
        }
        // Finally close the output stream
        finally {
            // If the file output stream is non-null
            if (null != objectOutputStream) {
                // Close the file output stream
                objectOutputStream.close();
            }
        }
        // Return the serialized object as a stream
        return byteArrayOutputStream;
    }

    /**
     * This method serializes an object and
     * writes it out to a byte array output stream
     * Then we can see the contents of this byte
     * array output stream as a string
     *
     * @param pObjectToSerialize The object to persist
     * @return The serialized object as a string
     * @throws Exception
     */
    public static String serialize_ObjectToString(Object pObjectToSerialize) throws Exception {
        // Get the stream back
        ByteArrayOutputStream byteArrayOutputStream = serialize_ObjectToStream(pObjectToSerialize);

        // Return the stream as a string
        return byteArrayOutputStream.toString();
    }

    /**
     * This method serializes an object and
     * writes it out to a byte array output stream
     * Then we can see the contents of this byte
     * array output stream as a string
     *
     * @param pObjectToSerialize The object to persist
     * @return The serialized object as a byte array
     * @throws Exception
     */
    public static byte[] serialize_ObjectToByteArray(Object pObjectToSerialize) throws Exception {
        // Get teh stream back
        ByteArrayOutputStream byteArrayOutputStream = serialize_ObjectToStream(pObjectToSerialize);

        // Return the stream as a byte array
        return byteArrayOutputStream.toByteArray();
    }

    /**
     * This method retrieve an object from
     * its byte array  representation
     *
     * @param pObjectAsString The serialized byte array representation the object
     * @return The deserialized object
     * @throws Exception
     */
    public static Object deserialize_BytesToObject(byte[] pObjectAsBytes) throws Exception {
        // In order to bullet proof this method we should check to
        // see if the file name and the object to persist exists
        if (null == pObjectAsBytes) {
            // Throw an exception indicating the fact
            throw (new Exception("Method params null"));

        }

        // The reference to the object to be returned
        Object objectFromPersistence = null;

        // Create a byte array input stream
        ByteArrayInputStream byteArrayInputStream = new ByteArrayInputStream(pObjectAsBytes);

        // Create an object input stream
        ObjectInputStream objectInputStream = new ObjectInputStream(byteArrayInputStream);

        // Try-finally block to perform the persisting
        try {
            // Write the object out to the input stream
            objectFromPersistence = objectInputStream.readObject();
        }
        // Finally close the input stream
        finally {
            // If the file input stream is non-null
            if (null != objectInputStream) {
                // Close the file input stream
                objectInputStream.close();
            }
        }

        // Return the object retrieved
        return objectFromPersistence;
    }

    /**
     * This method retrieve an object from
     * its string representation
     *
     * @param pObjectAsString The serialized string representation the object
     * @return The deserialized object
     * @throws Exception
     */
    public static Object deserialize_StringToObject(String pObjectAsString) throws Exception {
        return deserialize_BytesToObject(pObjectAsString.getBytes());
    }

    /**
     * This method persists a given object that implements
     * the serializable interface to a file.
     *
     * @param pObjectToPersist The object to persist
     * @param pFileName        The path of the file name
     * @throws Exception
     */
    public static void persistObjectToFile(Object pObjectToPersist,
                                           String pFileName) throws Exception {
        // In order to bullet proof this method we should check to
        // see if the file name and the object to persist exists
        if (null == pObjectToPersist ||
                null == pFileName) {
            // Throw an exception indicating the fact
            throw (new Exception(METHOD_PARAMS_NULL));

        }

        // Check to see if the object passed in is even
        // serializable. If it is not then throw an exception
        if (!(pObjectToPersist instanceof Serializable)) {
            // Throw an exception indicating the fact
            throw (new Exception(OBJECT_NOT_SERIALIZABLE));
        }

        // Create a file output stream
        FileOutputStream fileOutputStream = new FileOutputStream(pFileName);

        // Create a buffered output stream out of the file output stream
        BufferedOutputStream bufferedOutputStream = new BufferedOutputStream(fileOutputStream);

        // Create an object output stream
        ObjectOutputStream objectOutputStream = new ObjectOutputStream(bufferedOutputStream);

        // Try-finally block to perform the persisting
        try {
            // Write the object out to the output stream
            objectOutputStream.writeObject(pObjectToPersist);

            // Flush out the stream
            objectOutputStream.flush();
        }
        // Finally close the output stream
        finally {
            // If the file output stream is non-null
            if (null != objectOutputStream) {
                // Close the file output stream
                objectOutputStream.close();
            }
        }
    }

    /**
     * This method retrieve an object from
     * its file persistence
     *
     * @param pFileName The path of the file name
     * @return The object from its file persistence
     * @throws Exception
     */
    public static Object readObjectFromFile(String pFileName) throws Exception {
        // In order to bullet proof this method we should check to
        // see if the file name and the object to persist exists
        if (null == pFileName) {
            // Throw an exception indicating the fact
            throw (new Exception(METHOD_PARAMS_NULL));

        }

        // The reference to the object to be returned
        Object objectFromPersistence = null;

        // Create a file input stream
        FileInputStream fileInputStream = new FileInputStream(pFileName);

        // Create a buffered input stream out of the file input stream
        BufferedInputStream bufferedInputStream = new BufferedInputStream(fileInputStream);

        // Create an object input stream
        ObjectInputStream objectInputStream = new ObjectInputStream(bufferedInputStream);

        // Try-finally block to perform the persisting
        try {
            // Write the object out to the input stream
            objectFromPersistence = objectInputStream.readObject();
        }
        // Finally close the input stream
        finally {
            // If the file input stream is non-null
            if (null != objectInputStream) {
                // Close the file input stream
                objectInputStream.close();
            }
        }

        // Return the object retrieved
        return objectFromPersistence;
    }
}
