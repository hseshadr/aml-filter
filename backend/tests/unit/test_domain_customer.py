"""Unit tests for the KYC customer domain models."""

import pytest
from pydantic import ValidationError

from aml_filter.domain.customer import (
    IdDocument,
    KycRiskRating,
    OnboardingResult,
    OnboardingStatus,
)


def test_should_accept_valid_id_document_when_all_fields_present() -> None:
    # Given / When
    doc = IdDocument(
        doc_type="PASSPORT",
        number="X1234567",
        issuing_country="US",
        expiry="2030-01-01",
    )

    # Then
    assert doc.doc_type == "PASSPORT"
    assert doc.issuing_country == "US"


def test_should_reject_id_document_when_issuing_country_not_two_chars() -> None:
    # Given / When / Then
    with pytest.raises(ValidationError):
        IdDocument(
            doc_type="PASSPORT",
            number="X1234567",
            issuing_country="USA",
        )


def test_should_default_expiry_to_none_when_omitted() -> None:
    # Given / When
    doc = IdDocument(doc_type="NATIONAL_ID", number="42", issuing_country="GB")

    # Then
    assert doc.expiry is None


def test_should_expose_onboarding_status_members_when_imported() -> None:
    # Given / When / Then
    assert OnboardingStatus.DRAFT.value == "DRAFT"
    assert OnboardingStatus.PENDING_REVIEW.value == "PENDING_REVIEW"
    assert OnboardingStatus.ACTIVE.value == "ACTIVE"
    assert OnboardingStatus.REJECTED.value == "REJECTED"


def test_should_expose_kyc_risk_rating_members_when_imported() -> None:
    # Given / When / Then
    assert {r.value for r in KycRiskRating} == {"LOW", "MEDIUM", "HIGH"}


def test_should_build_onboarding_result_when_no_matches() -> None:
    # Given / When
    result = OnboardingResult(
        customer_id="cust-1",
        customer_reference="REF-1",
        screening_entity_id="whitelist:t:abc",
        onboarding_status=OnboardingStatus.PENDING_REVIEW,
        match_entity_ids=[],
    )

    # Then
    assert result.match_count == 0
    assert result.has_matches is False


def test_should_report_has_matches_when_match_ids_present() -> None:
    # Given / When
    result = OnboardingResult(
        customer_id="cust-1",
        customer_reference="REF-1",
        screening_entity_id="whitelist:t:abc",
        onboarding_status=OnboardingStatus.PENDING_REVIEW,
        match_entity_ids=["ofac:sdn:1", "ofac:sdn:2"],
    )

    # Then
    assert result.match_count == 2
    assert result.has_matches is True
