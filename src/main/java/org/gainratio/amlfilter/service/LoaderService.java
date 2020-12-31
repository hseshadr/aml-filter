package org.gainratio.amlfilter.service;

import lombok.AllArgsConstructor;
import org.apache.commons.lang3.StringUtils;
import org.gainratio.amlfilter.model.Entity;
import org.gainratio.amlfilter.parser.ofac.Parser;
import org.gainratio.amlfilter.repository.EntityRepository;
import org.gainratio.amlfilter.sdn.*;
import org.gainratio.amlfilter.util.AlgorithmUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Component
@AllArgsConstructor
public class LoaderService implements LoaderServiceInterface {
    private static final Logger logger = LoggerFactory.getLogger(LoaderService.class);
    private final Parser<Sanctions> sdnParser;
    private final EntityService entityService;

    @PostConstruct
    void init() throws Exception {
        logger.info("sdnParser={}", sdnParser);
        load();
    }

    @Override
    public List<Entity> load() throws Exception {
        Sanctions sanctions = sdnParser.parse();
        LocalDate sanctionsDate = getSanctionsDate(sanctions);
        int version = getSanctionsVersion(sanctions);
        Map<String, String> aliasIdToAliasTypeMap = getAliasTypeMap(sanctions);
        Map<String, String> areaIdToAreaCodeMap = getAreaCodeMap(sanctions);
        Map<String, String> areaIdToAreaCodeTypeMap = getAreaCodeTypeMap(sanctions);
        Map<String, String> calendarTypeIdToCalendarTypeMap = getCalendarTypeMap(sanctions);
        Map<String, String> countryIdToNameMap = getCountryNameMap(sanctions);
        Map<String, String> detailReferenceMap = getDetailReferenceMap(sanctions);

        List<Entity> entitites = getEntities(sanctions);
        logger.info("Saving entities.size(): {}", entitites.size());
        entityService.saveAll(entitites);
        return entitites;
    }

    private LocalDate getSanctionsDate(Sanctions sanctions) {
        Day day = sanctions.getDateOfIssue().getDay();
        Month month = sanctions.getDateOfIssue().getMonth();
        Year year = sanctions.getDateOfIssue().getYear();
        LocalDate sanctionsDate = LocalDate.of(year.getValue().intValue(),
                month.getValue().intValue(), day.getValue().intValue());
        logger.info("sanctionsDate={}", sanctionsDate);
        return sanctionsDate;
    }

    private int getSanctionsVersion(Sanctions sanctions) {
        int sanctionVersion = sanctions.getVersion().intValue();
        logger.info("sanctionVersion={}", sanctionVersion);
        return sanctionVersion;
    }

    private Map<String, String> getAliasTypeMap(Sanctions sanctions) {
        Map<String, String> aliasIdToAliasTypeMap = new HashMap<>();
        ReferenceValueSetsSchemaType.AliasTypeValues aliasTypeValues
                = sanctions.getReferenceValueSets().getAliasTypeValues();
        List<ReferenceValueSetsSchemaType.AliasTypeValues.AliasType> areaCodeList = aliasTypeValues.getAliasType();
        for (ReferenceValueSetsSchemaType.AliasTypeValues.AliasType aliasType : areaCodeList) {
            aliasIdToAliasTypeMap.put(aliasType.getID().toString(), aliasType.getValue());
        }
        logger.info("aliasIdToAliasTypeMap={}", aliasIdToAliasTypeMap);
        return aliasIdToAliasTypeMap;
    }

    private Map<String, String> getAreaCodeMap(Sanctions sanctions) {
        Map<String, String> areaIdToAreaCodeMap = new HashMap<>();
        ReferenceValueSetsSchemaType.AreaCodeValues areaCodeValues
                = sanctions.getReferenceValueSets().getAreaCodeValues();
        List<ReferenceValueSetsSchemaType.AreaCodeValues.AreaCode> areaCodeList = areaCodeValues.getAreaCode();
        for (ReferenceValueSetsSchemaType.AreaCodeValues.AreaCode areaCode : areaCodeList) {
            areaIdToAreaCodeMap.put(areaCode.getID().toString(), areaCode.getValue());
        }
        logger.info("areaIdToAreaCodeMap={}", areaIdToAreaCodeMap);
        return areaIdToAreaCodeMap;
    }

    private Map<String, String> getAreaCodeTypeMap(Sanctions sanctions) {
        Map<String, String> areaIdToAreaCodeTypeMap = new HashMap<>();
        ReferenceValueSetsSchemaType.AreaCodeTypeValues areaCodeTypeValues
                = sanctions.getReferenceValueSets().getAreaCodeTypeValues();
        List<ReferenceValueSetsSchemaType.AreaCodeTypeValues.AreaCodeType> areaCodeTypeList
                = areaCodeTypeValues.getAreaCodeType();
        for (ReferenceValueSetsSchemaType.AreaCodeTypeValues.AreaCodeType areaCodeType : areaCodeTypeList) {
            areaIdToAreaCodeTypeMap.put(areaCodeType.getID().toString(), areaCodeType.getValue());
        }
        logger.info("areaIdToAreaCodeTypeMap={}", areaIdToAreaCodeTypeMap);
        return areaIdToAreaCodeTypeMap;
    }

    private Map<String, String> getCalendarTypeMap(Sanctions sanctions) {
        Map<String, String> calendarIdToCalendarType = new HashMap<>();
        ReferenceValueSetsSchemaType.CalendarTypeValues calendarTypeValues
                = sanctions.getReferenceValueSets().getCalendarTypeValues();
        List<ReferenceValueSetsSchemaType.CalendarTypeValues.CalendarType> calendarTypeList
                = calendarTypeValues.getCalendarType();
        for (ReferenceValueSetsSchemaType.CalendarTypeValues.CalendarType calendarType : calendarTypeList) {
            calendarIdToCalendarType.put(calendarType.getID().toString(), calendarType.getValue());
        }
        logger.info("calendarIdToCalendarType={}", calendarIdToCalendarType);
        return calendarIdToCalendarType;
    }

    private Map<String, String> getCountryNameMap(Sanctions sanctions) {
        Map<String, String> countryIdToNameMap = new HashMap<>();
        ReferenceValueSetsSchemaType.CountryValues countryValues = sanctions.getReferenceValueSets().getCountryValues();
        List<ReferenceValueSetsSchemaType.CountryValues.Country> countryList = countryValues.getCountry();
        for (ReferenceValueSetsSchemaType.CountryValues.Country country : countryList) {
            countryIdToNameMap.put(country.getID().toString(), country.getValue());
        }
        logger.info("countryIdToNameMap={}", countryIdToNameMap);
        return countryIdToNameMap;
    }

    private Map<String, String> getDetailReferenceMap(Sanctions sanctions) {
        Map<String, String> detailReferenceIdToNameMap = new HashMap<>();
        ReferenceValueSetsSchemaType.DetailReferenceValues detailReferenceValues
                = sanctions.getReferenceValueSets().getDetailReferenceValues();
        List<ReferenceValueSetsSchemaType.DetailReferenceValues.DetailReference> detailReferenceList
                = detailReferenceValues.getDetailReference();
        for (ReferenceValueSetsSchemaType.DetailReferenceValues.DetailReference detailReference : detailReferenceList) {
            detailReferenceIdToNameMap.put(detailReference.getID().toString(), detailReference.getValue());
        }
        logger.info("detailReferenceIdToNameMap={}", detailReferenceIdToNameMap);
        return detailReferenceIdToNameMap;
    }

    private List<Entity> getEntities(Sanctions sanctions) {
        List<Entity> entityList = new ArrayList<>();
        List<DistinctPartySchemaType> distinctPartySchemaTypeList = sanctions.getDistinctParties().getDistinctParty();
        for (DistinctPartySchemaType dpst : distinctPartySchemaTypeList) {
            Entity entity = new Entity();
            entity.setListName("OFAC");
            entity.setEntityCodeInSource(dpst.getFixedRef());
            List<DistinctPartySchemaType.Profile> profileList = dpst.getProfile();
            for (DistinctPartySchemaType.Profile profile : profileList) {
                List<IdentitySchemaType> identitySchemaTypeList = profile.getIdentity();
                for (IdentitySchemaType identitySchemaType : identitySchemaTypeList) {
                    List<IdentitySchemaType.Alias> aliasList = identitySchemaType.getAlias();
                    for (IdentitySchemaType.Alias alias : aliasList) {
                        List<DocumentedNameSchemaType> documentedNameSchemaTypeList = alias.getDocumentedName();
                        for (DocumentedNameSchemaType documentedNameSchemaType : documentedNameSchemaTypeList) {
                            List<DocumentedNameSchemaType.DocumentedNamePart> documentedNamePartList
                                    = documentedNameSchemaType.getDocumentedNamePart();
                            for (DocumentedNameSchemaType.DocumentedNamePart documentedNamePart : documentedNamePartList) {
                                DocumentedNameSchemaType.DocumentedNamePart.NamePartValue namePartValue = documentedNamePart.getNamePartValue();
                                String cleanedName = AlgorithmUtils.cleanString(namePartValue.getValue());
                                if (StringUtils.isBlank(cleanedName)) {
                                    continue;
                                }
                                entity.getEntityNameSet().add(namePartValue.getValue());
                                entity.getCleanedEntityNames()
                                        .add(cleanedName);
                            }
                        }
                    }
                }
            }
            //logger.info("entity={}", entity);
            entityList.add(entity);
        }
        return entityList;
    }
}
