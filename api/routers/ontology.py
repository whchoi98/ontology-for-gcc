"""GET /api/ontology/{schema,standards,validation} — Plan 5 Task 5.2.1."""
from __future__ import annotations
from fastapi import APIRouter

from api.services.ontology_meta import schema_summary, standards, validation_report

router = APIRouter(prefix='/api/ontology', tags=['ontology'])


@router.get('/schema')
def schema_route():
    return schema_summary()


@router.get('/standards')
def standards_route():
    return standards()


@router.get('/validation')
def validation_route():
    return validation_report()
