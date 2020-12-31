# aml-filter

# Easy Run
    cd aml-filter
    ./gradlew clean build bootJar
    docker build -t hseshadr/aml-filter-image .
    docker tag 5af7fe037c55 hseshadr/aml-filter-image:latest
    docker push hseshadr/aml-filter-image
    docker pull hseshadr/aml-filter-image
    docker-compose down
    docker-compose up
    
    
 
