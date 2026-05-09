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

def items_to_observations(sido: str, items: list[dict]) -> list[WeatherObservation]:
    """KMA 응답을 WeatherObservation 노드로 변환. 시간별 그룹핑."""
    by_dt_hour: dict[tuple, dict] = {}
    for it in items:
        dt = it['fcstDate']; hour = int(it['fcstTime'][:2])
        cat = it['category']; val = it['fcstValue']
        key = (dt, hour)
        if key not in by_dt_hour:
            by_dt_hour[key] = {}
        try: vf = float(val)
        except (TypeError, ValueError): continue
        if cat == 'TMP':  by_dt_hour[key]['temp_c'] = vf
        elif cat == 'PCP': by_dt_hour[key]['rain_mm'] = vf if val != '강수없음' else 0.0
        elif cat == 'WSD': by_dt_hour[key]['wind_mps'] = vf
    return [
        WeatherObservation(sido_nm=sido, dt=dt, hour=hour,
                           temp_c=v.get('temp_c'), rain_mm=v.get('rain_mm'),
                           wind_mps=v.get('wind_mps'), pm10_ugm3=None)
        for (dt, hour), v in by_dt_hour.items()
    ]
