FROM openjdk:15-jdk-alpine
VOLUME /tmp
ARG JAR_FILE=build/libs/*
COPY ${JAR_FILE} aml-filter.jar
ENTRYPOINT ["java","-jar","/aml-filter.jar"]