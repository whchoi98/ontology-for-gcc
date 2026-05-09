"""file 7 (TCO016, 31,109 rows × 452 GSC + opinet 경쟁사) → GasStation + Region."""
from __future__ import annotations
import yaml
from pathlib import Path
from data.real._common import read_csv_rows
from data.schemas import GasStation, Region

_OPINET_PATH = Path('ontology/standards/opinet_codes.yaml')
_OPINET = yaml.safe_load(_OPINET_PATH.read_text(encoding='utf-8')) if _OPINET_PATH.exists() else {}
_TRDM = _OPINET.get('gass_trdm', {})
_SIDO = _OPINET.get('sido', {})

# Raw data uses alphanumeric codes (not numeric); map them to canonical brand labels.
# Numeric codes from opinet_codes.yaml still resolve via _TRDM lookup as fallback.
_RAW_BRAND_MAP = {
    'GSC': 'GSC',           # GS칼텍스
    'SKE': 'SK',            # SK에너지
    'SKG': 'SK',            # SK가스
    'HDO': 'HD',            # HD현대오일뱅크
    'SO':  'SOIL',          # S-OIL (단독표기)
    'SOL': 'SOIL',          # S-OIL (대체)
    'NHO': 'NHJN',          # 농협주유소
    'ALK': 'ALK',           # 알뜰
    'RTO': 'OTHER',         # 자영
    'RTX': 'OTHER',
    'E1G': 'OTHER',         # E1
    'ETC': 'OTHER',
}


def _brand(code: str) -> str:
    if not code:
        return 'OTHER'
    if code in _RAW_BRAND_MAP:
        return _RAW_BRAND_MAP[code]
    return _TRDM.get(code, {}).get('brand', 'OTHER')


def _sido_nm(area_cd: str) -> str:
    return _SIDO.get(area_cd, {}).get('sido_nm', area_cd)


def load(path: str) -> tuple[list[GasStation], list[Region]]:
    stations: list[GasStation] = []
    regions: dict[str, Region] = {}
    seen_opinet: set[str] = set()
    for row in read_csv_rows(path):
        opinet = (row.get('opinet_no') or '').strip()
        if not opinet or opinet in seen_opinet:
            continue
        seen_opinet.add(opinet)
        sido_cd = (row.get('sido_opinet_area_cd') or '').strip()
        sgg_cd = (row.get('sgg_opinet_area_cd') or '').strip()
        sido_nm = _sido_nm(sido_cd)
        try:
            lat = float(row.get('wgs_ycrd') or 0)
            lon = float(row.get('wgs_xcrd') or 0)
        except ValueError:
            lat, lon = 0.0, 0.0
        stations.append(GasStation(
            opinet_no=opinet, site_cd=(row.get('site_cd') or '').strip() or None,
            name=(row.get('gass_nm') or '').strip() or opinet,
            addr=(row.get('road_nm_addr') or '').strip() or (row.get('ltno_addr') or '').strip(),
            sido_nm=sido_nm, sgg_nm=sgg_cd or '',
            self_yn=(row.get('self_gass_yn') or 'N').strip(),
            cvs_yn=(row.get('cvs_xn') or 'N').strip(),
            crwa_yn=(row.get('crwa_xn') or 'N').strip(),
            lat=lat, lon=lon,
            brand_cd=_brand((row.get('erm_gass_trdm_dvs_cd') or '').strip()),
        ))
        # Region 등록
        if sido_nm and sido_nm not in regions:
            regions[sido_nm] = Region(
                region_cd=sido_cd or sido_nm,
                sido_nm=sido_nm, level='sido',
            )
    return stations, list(regions.values())
