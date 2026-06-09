# tests/ontology/test_schema_ttl.py
"""schema.ttl integrity — generated from data/schemas.py (the SSoT).

These tests are drift-proof: counts are pinned to ALL_CLASSES / ALL_RELATIONS
rather than to magic numbers, and the freshness test fails if anyone edits
data/schemas.py without regenerating the TTL (see ADR-0020).
"""
from pathlib import Path

import rdflib

from data.schemas import ALL_CLASSES, ALL_RELATIONS
from ontology.generate_schema_ttl import render

_SCHEMA_PATH = Path(__file__).resolve().parents[2] / "ontology" / "schema.ttl"
_GCC = rdflib.Namespace("https://amzn.tech/gcc/ontology#")

# Manufacturing classes from the retired retail/mfg reference PoC. None of these
# may appear in the GCC customer ontology.
_MFG_CLASSES = {
    "Product", "Module", "Component", "RawMaterial", "Manufacturer", "Supplier",
    "SubSupplier", "CustomerAccount", "Plant", "TradeLane", "Standard",
    "Certification", "Regulation", "Substance", "QualityIncident",
    "EightDReport", "RootCause", "Telemetry", "MaintenanceEvent",
    "ESGIndicator", "CarbonScope",
}


def _graph() -> rdflib.Graph:
    g = rdflib.Graph()
    g.parse(str(_SCHEMA_PATH), format="turtle")
    return g


def test_schema_parses_as_turtle():
    # Raises on any syntax error.
    _graph()


def test_class_count_matches_ssot():
    g = _graph()
    classes = list(g.triples((None, rdflib.RDF.type, rdflib.OWL.Class)))
    assert len(classes) == len(ALL_CLASSES), (
        f"owl:Class count {len(classes)} != ALL_CLASSES {len(ALL_CLASSES)} "
        "— regenerate: python -m ontology.generate_schema_ttl"
    )


def test_object_property_count_matches_ssot():
    g = _graph()
    props = list(g.triples((None, rdflib.RDF.type, rdflib.OWL.ObjectProperty)))
    assert len(props) == len(ALL_RELATIONS), (
        f"owl:ObjectProperty count {len(props)} != ALL_RELATIONS {len(ALL_RELATIONS)}"
    )


def test_is_gcc_domain_not_manufacturing():
    g = _graph()
    names = {
        str(s).split("#")[-1]
        for s, _, _ in g.triples((None, rdflib.RDF.type, rdflib.OWL.Class))
    }
    # GCC customer classes are present...
    assert "Customer" in names and "FuelTransaction" in names and "GasStation" in names
    # ...and zero manufacturing residue.
    residue = names & _MFG_CLASSES
    assert not residue, f"manufacturing class residue in schema.ttl: {sorted(residue)}"


def test_every_class_in_ssot_is_declared():
    g = _graph()
    declared = {
        str(s).split("#")[-1]
        for s, _, _ in g.triples((None, rdflib.RDF.type, rdflib.OWL.Class))
    }
    expected = {m.__name__ for m in ALL_CLASSES}
    assert declared == expected, f"class set drift: {declared ^ expected}"


def test_every_relation_in_ssot_is_declared():
    g = _graph()
    declared = set()
    for p, _, _ in g.triples((None, rdflib.RDF.type, rdflib.OWL.ObjectProperty)):
        dom = next(g.objects(p, rdflib.RDFS.domain))
        rng = next(g.objects(p, rdflib.RDFS.range))
        label = next(g.objects(p, rdflib.RDFS.label))
        declared.add((str(dom).split("#")[-1], str(label), str(rng).split("#")[-1]))
    expected = set(ALL_RELATIONS)
    assert declared == expected, f"relation set drift: {declared ^ expected}"


def test_no_orphan_domain_or_range():
    g = _graph()
    classes = {s for s, _, _ in g.triples((None, rdflib.RDF.type, rdflib.OWL.Class))}
    orphans = []
    for p, _, _ in g.triples((None, rdflib.RDF.type, rdflib.OWL.ObjectProperty)):
        for endpoint in list(g.objects(p, rdflib.RDFS.domain)) + list(
            g.objects(p, rdflib.RDFS.range)
        ):
            if endpoint not in classes:
                orphans.append((str(p), str(endpoint)))
    assert not orphans, f"object properties referencing undeclared classes: {orphans}"


def test_schema_is_fresh():
    """On-disk schema.ttl must be byte-identical to a fresh regeneration."""
    on_disk = _SCHEMA_PATH.read_text(encoding="utf-8")
    assert on_disk == render(), (
        "ontology/schema.ttl is stale — run: python -m ontology.generate_schema_ttl"
    )
