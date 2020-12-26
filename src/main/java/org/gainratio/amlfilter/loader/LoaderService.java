package org.gainratio.amlfilter.loader;

import lombok.AllArgsConstructor;
import org.gainratio.amlfilter.model.Entity;
import org.gainratio.amlfilter.parser.Parser;
import org.gainratio.amlfilter.sdn.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;
import java.util.List;

@Component
@AllArgsConstructor
public class LoaderService {
    private static final Logger logger = LoggerFactory.getLogger(LoaderService.class);
    private final Parser<Sanctions> sdnParser;

    @PostConstruct
    void init() throws Exception {
        logger.info("sdnParser={}", sdnParser);
        load();
    }

    public void load() throws Exception {
        Sanctions sanctions = sdnParser.parse();
        List<DistinctPartySchemaType> distinctPartySchemaTypeList = sanctions.getDistinctParties().getDistinctParty();
        // distinctPartySchemaTypeList = distinctPartySchemaTypeList.subList(0, 5);
        for (DistinctPartySchemaType dpst : distinctPartySchemaTypeList) {
            Entity entity = new Entity();
            List<DistinctPartySchemaType.Profile> profileList = dpst.getProfile();
            for (DistinctPartySchemaType.Profile profile : profileList) {
                List<IdentitySchemaType> identitySchemaTypeList = profile.getIdentity();
                for (IdentitySchemaType identitySchemaType : identitySchemaTypeList) {
                    List<IdentitySchemaType.Alias> aliasList = identitySchemaType.getAlias();
                    for (IdentitySchemaType.Alias alias : aliasList) {
                        List<DocumentedNameSchemaType> documentedNameSchemaTypeList = alias.getDocumentedName();
                        for (DocumentedNameSchemaType documentedNameSchemaType : documentedNameSchemaTypeList) {
                            List<DocumentedNameSchemaType.DocumentedNameCountry> documentedNameCountryList = documentedNameSchemaType.getDocumentedNameCountry();
                            for (DocumentedNameSchemaType.DocumentedNameCountry documentedNameCountry : documentedNameCountryList) {
                                documentedNameCountry.getCountryID();
                            }
                            List<IDRegDocumentReference> idRegDocumentReferenceList = documentedNameSchemaType.getIDRegDocumentReference();
                            for (IDRegDocumentReference idRegDocumentReference : idRegDocumentReferenceList) {
                                idRegDocumentReference.getIDRegDocumentID();
                            }

                        }
                    }
                }
            }
            //logger.info(new ObjectMapper().writerWithDefaultPrettyPrinter().writeValueAsString(dpst));
        }
    }
}
