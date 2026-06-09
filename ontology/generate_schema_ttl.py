"""Generate `ontology/schema.ttl` (OWL/RDF) deterministically from the SSoT.

The single source of truth for the GCC customer ontology is `data/schemas.py`
(`ALL_CLASSES` Pydantic models + `ALL_RELATIONS` edge tuples). The TTL that gets
uploaded to Neptune (`ontology/upload.py`) and indexed for KB/SPARQL must mirror
it exactly — so we *generate* the TTL rather than hand-maintaining a third copy
that can drift (see ADR-0020).

Usage::

    python -m ontology.generate_schema_ttl            # write ontology/schema.ttl
    python -m ontology.generate_schema_ttl --check    # exit 1 if on-disk is stale
    python -m ontology.generate_schema_ttl --stdout   # print, write nothing

Determinism: output is a pure function of the SSoT (no timestamps / randomness),
so regeneration is byte-identical and the `--check` freshness gate is meaningful.

Modeling choices:
- One ``owl:Class`` per model in ``ALL_CLASSES`` (25).
- One ``owl:ObjectProperty`` per edge in ``ALL_RELATIONS`` (31). The IRI is
  ``gcc:{source}_{edge}_{target}`` so reused edge labels (``OF`` appears twice,
  ``AT_TIME`` twice) stay distinct properties with a single ``rdfs:domain`` /
  ``rdfs:range`` each. ``rdfs:label`` preserves the property-graph edge name.
- One ``owl:DatatypeProperty`` per model field, IRI ``gcc:{Class}_{field}``
  (class names are single CamelCase tokens with no underscores, so this is
  unambiguous). Pydantic annotations map to ``xsd:*`` ranges; ``Literal[...]``
  enums are emitted as ``xsd:string`` with the allowed values in ``rdfs:comment``.
"""
from __future__ import annotations

import sys
import typing
from pathlib import Path

from data.schemas import ALL_CLASSES, ALL_RELATIONS

# Keep the namespace identical to the legacy TTL so any existing `gcc:`-prefixed
# SPARQL keeps resolving against the same base IRI.
_BASE = "https://amzn.tech/gcc/ontology#"
_SCHEMA_PATH = Path(__file__).resolve().parent / "schema.ttl"

# Pydantic / Python scalar -> XSD datatype.
_XSD: dict[type, str] = {
    str: "xsd:string",
    int: "xsd:integer",
    float: "xsd:decimal",
    bool: "xsd:boolean",
}


def _resolve(annotation: object) -> tuple[str, bool, list | None]:
    """Map a field annotation to ``(range_iri, is_multivalued, enum_values)``.

    ``range_iri`` is an ``xsd:*`` term or ``rdfs:Literal`` for free-form/dict.
    """
    origin = typing.get_origin(annotation)

    # Optional[X] / X | None  -> unwrap the single non-None member.
    union_types = {typing.Union}
    ut = getattr(__import__("types"), "UnionType", None)
    if ut is not None:
        union_types.add(ut)
    if origin in union_types:
        members = [a for a in typing.get_args(annotation) if a is not type(None)]
        if len(members) == 1:
            return _resolve(members[0])
        return ("rdfs:Literal", False, None)

    # list[X] / set[X] / tuple[X, ...] -> multivalued, range of element type.
    if origin in (list, set, tuple):
        args = typing.get_args(annotation)
        inner = args[0] if args else str
        rng, _, enum = _resolve(inner)
        return (rng, True, enum)

    # Literal['a', 'b', ...] -> string with enumerated values in a comment.
    if origin is typing.Literal:
        return ("xsd:string", False, list(typing.get_args(annotation)))

    if annotation in _XSD:
        return (_XSD[annotation], False, None)

    # dict (centroid, extras) and anything unrecognised.
    return ("rdfs:Literal", False, None)


def _esc(text: str) -> str:
    """Escape a string for a Turtle string literal."""
    return text.replace("\\", "\\\\").replace('"', '\\"')


def render() -> str:
    """Render the full TTL document as a string (deterministic)."""
    lines: list[str] = []
    out = lines.append

    out("@prefix owl:  <http://www.w3.org/2002/07/owl#> .")
    out("@prefix rdf:  <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .")
    out("@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .")
    out("@prefix xsd:  <http://www.w3.org/2001/XMLSchema#> .")
    out(f"@prefix gcc:  <{_BASE}> .")
    out("")
    out("# GENERATED FILE — DO NOT EDIT BY HAND.")
    out("# Source of truth: data/schemas.py (ALL_CLASSES + ALL_RELATIONS).")
    out("# Regenerate: python -m ontology.generate_schema_ttl   (see ADR-0020)")
    out("")
    out("<https://amzn.tech/gcc/ontology> a owl:Ontology ;")
    out('    rdfs:label "GS Caltex M&M Customer Ontology" ;')
    out('    rdfs:comment "GSC M&M본부 고객 온톨로지 — 25 클래스 / 31 관계. data/schemas.py 에서 생성." .')
    out("")

    out(f"# ==== Classes ({len(ALL_CLASSES)}) ====")
    out("")
    for model in ALL_CLASSES:
        cls = model.__name__
        out(f'gcc:{cls} a owl:Class ; rdfs:label "{cls}" .')
        for fname, finfo in model.model_fields.items():
            rng, multi, enum = _resolve(finfo.annotation)
            req = "required" if finfo.is_required() else "optional"
            card = "0..*" if multi else ("1" if finfo.is_required() else "0..1")
            parts = [
                f"gcc:{cls}_{fname} a owl:DatatypeProperty",
                f"rdfs:domain gcc:{cls}",
                f"rdfs:range {rng}",
                f'rdfs:label "{fname}"',
            ]
            comment = f"{req}, card {card}"
            if enum is not None:
                comment += "; one of: " + ", ".join(str(v) for v in enum)
            parts.append(f'rdfs:comment "{_esc(comment)}"')
            out("  " + " ; ".join(parts) + " .")
        out("")

    out(f"# ==== Object Properties / relations ({len(ALL_RELATIONS)}) ====")
    out("")
    for source, edge, target in ALL_RELATIONS:
        iri = f"gcc:{source}_{edge}_{target}"
        out(
            f'{iri} a owl:ObjectProperty ; '
            f"rdfs:domain gcc:{source} ; rdfs:range gcc:{target} ; "
            f'rdfs:label "{edge}" .'
        )
    out("")

    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    doc = render()

    if "--stdout" in argv:
        print(doc)
        return 0

    if "--check" in argv:
        if not _SCHEMA_PATH.exists():
            print(f"[stale] {_SCHEMA_PATH} does not exist", file=sys.stderr)
            return 1
        current = _SCHEMA_PATH.read_text(encoding="utf-8")
        if current != doc:
            print(
                f"[stale] {_SCHEMA_PATH} is out of sync with data/schemas.py — "
                "run: python -m ontology.generate_schema_ttl",
                file=sys.stderr,
            )
            return 1
        print(f"[fresh] {_SCHEMA_PATH} matches data/schemas.py")
        return 0

    _SCHEMA_PATH.write_text(doc, encoding="utf-8")
    print(
        f"[wrote] {_SCHEMA_PATH} — {len(ALL_CLASSES)} classes, "
        f"{len(ALL_RELATIONS)} object properties"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
