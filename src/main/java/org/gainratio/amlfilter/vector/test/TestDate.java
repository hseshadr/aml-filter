package org.gainratio.amlfilter.vector.test;

import java.util.Date;


public class TestDate {

    /**
     * @param args
     */
    public static void main(String[] args) {
        System.out.println("System.currentTimeMillis() : " + System.currentTimeMillis());
        System.out.println("System.nanoTime() : " + System.nanoTime());

        Date date = new Date(System.currentTimeMillis());

        System.out.println("Date : " + new Date(System.currentTimeMillis()));

    }

}
