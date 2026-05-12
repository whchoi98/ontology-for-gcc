"""기상청 단기예보·동네예보 클라이언트.
data.go.kr API 키는 Secrets Manager에서 가져옴."""
from __future__ import annotations
import json, time, requests, boto3
from typing import Optional
from data.schemas import WeatherObservation

SECRET_NAME = 'ontology-gcc-dev/kma-api-key'
BASE = 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst'

# 시도 대표 격자좌표 (단기예보 요청용 nx/ny). 실서비스는 더 정밀한 동네 선택 필요.
SIDO_GRID = {
    '서울': (60, 127), '부산': (98, 76), '대구': (89, 90), '인천': (55, 124),
    '광주': (58, 74), '대전': (67, 100), '울산': (102, 84), '세종': (66, 103),
    '경기': (61, 120), '강원': (73, 134), '충북': (69, 107), '충남': (68, 100),
    '전북': (63, 89), '전남': (51, 67), '경북': (87, 106), '경남': (91, 77), '제주': (52, 38),
}

def _api_key() -> str:
    sm = boto3.client('secretsmanager')
    resp = sm.get_secret_value(SecretId=SECRET_NAME)
    return resp['SecretString'].strip()

class KmaForecastClient:
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or _api_key()

    def fetch_short_forecast(self, sido: str, base_date: str, base_time: str = '0500') -> list[dict]:
        """base_date='20260508', base_time in {'0200','0500','0800',...}."""
        nx, ny = SIDO_GRID[sido]
        params = {
            'serviceKey': self.api_key, 'pageNo': 1, 'numOfRows': 1000,
            'dataType': 'JSON', 'base_date': base_date, 'base_time': base_time,
            'nx': nx, 'ny': ny,
        }
        r = requests.get(BASE, params=params, timeout=20)
        r.raise_for_status()
        items = r.json().get('response', {}).get('body', {}).get('items', {}).get('item', [])
        return items

import re

# KMA PCP (강수량) 값은 비-숫자 한국어 문자열 — 정수 변환 전에 파싱.
#   '강수없음'    → 0.0
#   '1mm 미만'    → 0.5  (midpoint 0~1)
#   '5.5mm'       → 5.5
#   '30~50mm'     → 40.0 (midpoint)
#   '50mm 이상'   → 50.0 (lower bound)
#   '' or None    → None (불명)
_PCP_NUM = re.compile(r'(\d+(?:\.\d+)?)')


def _parse_pcp(val: str | None) -> float | None:
    """KMA 강수량 문자열을 mm 단위 float으로 변환. None이면 적재 안 함."""
    if val is None or val == '':
        return None
    s = str(val).strip()
    if s in ('강수없음', '0'):
        return 0.0
    if '미만' in s:
        m = _PCP_NUM.search(s)
        return float(m.group(1)) / 2 if m else 0.5
    if '~' in s:
        nums = _PCP_NUM.findall(s)
        if len(nums) >= 2:
            return (float(nums[0]) + float(nums[1])) / 2
        if nums:
            return float(nums[0])
        return None
    if '이상' in s:
        m = _PCP_NUM.search(s)
        return float(m.group(1)) if m else None
    # 일반 'X.Xmm' 또는 'X.X' 형식
    m = _PCP_NUM.search(s)
    return float(m.group(1)) if m else None


def items_to_observations(sido: str, items: list[dict]) -> list[WeatherObservation]:
    """KMA 응답을 WeatherObservation 노드로 변환. 시간별 그룹핑.

    중요: PCP/SNO 같은 카테고리는 한국어 문자열 ('강수없음', '1mm 미만',
    '30~50mm', '50mm 이상') — float() 직접 변환 시 ValueError 후
    continue로 빠져 모든 강수 데이터가 누락되던 버그. _parse_pcp helper로
    각 표현을 명시적으로 매핑.
    """
    by_dt_hour: dict[tuple, dict] = {}
    for it in items:
        dt = it['fcstDate']; hour = int(it['fcstTime'][:2])
        cat = it['category']; val = it['fcstValue']
        key = (dt, hour)
        bucket = by_dt_hour.setdefault(key, {})

        if cat == 'PCP':
            r = _parse_pcp(val)
            if r is not None:
                bucket['rain_mm'] = r
            continue

        # TMP, WSD: 일반 숫자 문자열
        try:
            vf = float(val)
        except (TypeError, ValueError):
            continue
        if cat == 'TMP':
            bucket['temp_c'] = vf
        elif cat == 'WSD':
            bucket['wind_mps'] = vf
    return [
        WeatherObservation(sido_nm=sido, dt=dt, hour=hour,
                           temp_c=v.get('temp_c'), rain_mm=v.get('rain_mm'),
                           wind_mps=v.get('wind_mps'), pm10_ugm3=None)
        for (dt, hour), v in by_dt_hour.items()
    ]
