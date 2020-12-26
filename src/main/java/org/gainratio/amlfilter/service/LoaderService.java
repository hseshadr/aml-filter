package org.gainratio.amlfilter.service;

import lombok.AllArgsConstructor;
import org.gainratio.amlfilter.model.Entity;
import org.gainratio.amlfilter.parser.ofac.Parser;
import org.gainratio.amlfilter.sdn.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

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
        LocalDate sanctionsDate = getSanctionsDate(sanctions);
        logger.info("sanctionsDate={}", sanctionsDate);
        int version = getSanctionsVersion(sanctions);
        logger.info("version={}", version);
        getSanctionCountries(sanctions);


        List<DistinctPartySchemaType> distinctPartySchemaTypeList = sanctions.getDistinctParties().getDistinctParty();
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

    private LocalDate getSanctionsDate(Sanctions sanctions) {
        Day day = sanctions.getDateOfIssue().getDay();
        Month month = sanctions.getDateOfIssue().getMonth();
        Year year = sanctions.getDateOfIssue().getYear();
        return LocalDate.of(year.getValue().intValue(), month.getValue().intValue(), day.getValue().intValue());
    }

    private int getSanctionsVersion(Sanctions sanctions) {
        return sanctions.getVersion().intValue();
    }

    private void getSanctionCountries(Sanctions sanctions) {
        Set<String> countryIdList = new TreeSet<>();
        sanctions.getReferenceValueSets().getCountryValues();
        logger.info("countryIdList={}", countryIdList);
    }
}
