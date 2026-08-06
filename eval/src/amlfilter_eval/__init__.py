"""Offline decision-quality evaluation for aml-filter.

The retrieval-recall harness in
`frontend/packages/amlfilter-publisher/src/recall/` answers "did the sanctioned
entity appear in the results". This package answers the other half: of the alerts
the product raised, how many were the entity screened, and of the sanctioned
people screened, how many did it show nothing for.

Read `collision.py` first. It carries the one assumption that sets a ceiling on
every number here, and it is awaiting the owner's ruling.
"""
