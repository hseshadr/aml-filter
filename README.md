# aml-filter

# Setup 
https://github.com/AdoptOpenJDK/homebrew-openjdk (Java8+)
Download intellij


# Easy Run
    cd aml-filter
    ./gradlew clean build bootJar
    docker build -t hseshadr/aml-filter-image .
    docker push hseshadr/aml-filter-image
    docker pull hseshadr/aml-filter-image
    docker-compose down
    docker-compose up
    
    
 
