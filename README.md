# aml-filter

# Setup 
https://github.com/AdoptOpenJDK/homebrew-openjdk (Java8+)
Download intellij


# Easy Run
    cd aml-filter
    ./gradlew clean build bootJar
    docker build -t hseshadr/aml-filter-image .
    (optional) docker push hseshadr/aml-filter-image
    (optional) docker pull hseshadr/aml-filter-image
    docker-compose down
    docker-compose up
    
    
 # Algorithms

https://commons.apache.org/proper/commons-text/apidocs/org/apache/commons/text/similarity/