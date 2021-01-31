package org.gainratio.amlfilter.parser.ofac;

import lombok.Data;
import org.gainratio.amlfilter.model.Entity;
import org.gainratio.amlfilter.parser.Parser;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;
import java.util.ArrayList;
import java.util.List;

@Component
@Data
public class SDNParser implements Parser<List<Entity>> {
    private static final Logger logger = LoggerFactory.getLogger(SDNParser.class);

    @Value("${sdn.URL}")
    private String url;

    @PostConstruct
    void init() throws Exception {
        logger.info("url={}", url);
    }

    @Override
    public List<Entity> parse() throws Exception {
        return new ArrayList<>();
    }
}
