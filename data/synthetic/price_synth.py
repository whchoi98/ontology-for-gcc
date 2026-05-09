"""FuelPrice 1년치 합성 (source=synthetic)."""
import math
from data.schemas import FuelPrice, GasStation
from data.synthetic._common import seeded_rng

BASE = {'regular': 1700, 'premium': 2000, 'diesel': 1600, 'kerosene': 1400, 'lpg': 1100}


def generate_yearly_for_stations(stations: list[GasStation], days: int = 365) -> list[FuelPrice]:
    out = []
    for s in stations:
        rng = seeded_rng(f'price:{s.opinet_no}')
        for d in range(days):
            year, month, day = 2025, ((d // 30) % 12) + 1, (d % 28) + 1
            for grade, base in BASE.items():
                # 월별 ±5% 계절성, 일별 ±1% 잡음
                seasonal = math.sin((month / 12) * 2 * math.pi) * 0.05
                noise = (rng.random() - 0.5) * 0.02
                amt = int(base * (1 + seasonal + noise))
                out.append(FuelPrice(
                    station_opinet_no=s.opinet_no, fuel_grade=grade,
                    dt=f'{year:04d}{month:02d}{day:02d}',
                    amount=amt, source='synthetic',
                ))
    return out
