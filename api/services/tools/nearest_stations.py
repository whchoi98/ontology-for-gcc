"""Tool: nearest_stations — haversine k-NN over GasStation nodes."""
from __future__ import annotations
from math import radians, sin, cos, sqrt, atan2

from api.services.neptune import open_cypher


def _haversine(la1: float, lo1: float, la2: float, lo2: float) -> float:
    R = 6371.0
    la1, lo1, la2, lo2 = map(radians, [la1, lo1, la2, lo2])
    dl = lo2 - lo1
    da = la2 - la1
    a = sin(da / 2) ** 2 + cos(la1) * cos(la2) * sin(dl / 2) ** 2
    return 2 * R * atan2(sqrt(a), sqrt(1 - a))


def run(input: dict, *, persona_id: str, session_id: str, cust_id):
    res = open_cypher('MATCH (s:GasStation) RETURN s LIMIT 5000')
    items = res.get('results', [])
    out: list = []
    lat = input.get('lat', 0.0)
    lon = input.get('lon', 0.0)
    radius = input.get('radius_km', 5.0)
    for it in items:
        s = it.get('s', {}) if isinstance(it, dict) else {}
        try:
            d = _haversine(lat, lon, s.get('lat', 0.0) or 0.0, s.get('lon', 0.0) or 0.0)
        except Exception:
            continue
        if d <= radius:
            out.append({'station': s, 'distance_km': round(d, 2)})
    out.sort(key=lambda x: x['distance_km'])
    return {'stations': out[: input.get('k', 10)]}
