'use client';
import { useEffect, useRef } from 'react';
import type { GeoPermissibleObjects, GeoProjection } from 'd3-geo';

type Props = {
  data: Record<string, number>;
  geoUrl?: string;
};

// Neptune `sido_nm` (짧은 명) ↔ GeoJSON properties.name (정식명) 매핑.
// southkorea-maps/kostat/2018 17개 시도 정식 명칭과 GCC 데이터 짧은 명을 양방향 일치.
const SHORT_TO_LONG: Record<string, string> = {
  '서울': '서울특별시', '부산': '부산광역시', '대구': '대구광역시',
  '인천': '인천광역시', '광주': '광주광역시', '대전': '대전광역시',
  '울산': '울산광역시', '세종': '세종특별자치시',
  '경기': '경기도', '강원': '강원도',
  '충북': '충청북도', '충남': '충청남도',
  '전북': '전라북도', '전남': '전라남도',
  '경북': '경상북도', '경남': '경상남도',
  '제주': '제주특별자치도',
};

function normalizeForMatch(input: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(input)) {
    const long = SHORT_TO_LONG[k] ?? k;
    out[long] = (out[long] ?? 0) + v;
  }
  return out;
}

export default function KoreaChoropleth({
  data,
  geoUrl = '/geo/skorea-provinces.geojson',
}: Props) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const svg = ref.current;
    let cancelled = false;
    (async () => {
      const d3 = await import('d3-geo');
      let geo: { features?: unknown[] } = { features: [] };
      try {
        const r = await fetch(geoUrl);
        geo = await r.json();
      } catch {
        geo = { features: [] };
      }
      if (cancelled) return;
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      const w = 600;
      const h = 700;
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      const proj: GeoProjection = d3
        .geoMercator()
        .scale(5500)
        .center([127.8, 36])
        .translate([w / 2, h / 2]);
      const path = d3.geoPath(proj);
      const features = (geo.features as Array<{
        properties?: { SIDO_NM?: string; name?: string; name_eng?: string };
      }>) || [];

      if (features.length === 0) {
        const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        txt.setAttribute('x', String(w / 2));
        txt.setAttribute('y', String(h / 2));
        txt.setAttribute('text-anchor', 'middle');
        txt.setAttribute('fill', '#94a3b8');
        txt.setAttribute('font-size', '14');
        txt.textContent = '시도 GeoJSON 로드 실패';
        svg.appendChild(txt);
        return;
      }

      const normalizedData = normalizeForMatch(data);
      const values = Object.values(normalizedData);
      const maxVal = values.length > 0 ? Math.max(...values) : 1;

      for (const f of features) {
        const longName = (f.properties?.name ?? f.properties?.SIDO_NM ?? '') as string;
        const v = normalizedData[longName] ?? 0;
        const intensity = maxVal > 0 ? v / maxVal : 0;
        // 다크 테마용 — accent-500 (orange) 색조에 intensity 반영. 0이면 어두운 회색.
        const fill = v > 0
          ? `rgba(251,146,60,${0.15 + intensity * 0.7})`
          : 'rgba(51,65,85,0.4)';
        const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const dStr = path(f as unknown as GeoPermissibleObjects) || '';
        p.setAttribute('d', dStr);
        p.setAttribute('fill', fill);
        p.setAttribute('stroke', '#475569');
        p.setAttribute('stroke-width', '0.5');
        p.setAttribute('class', 'transition');
        const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        title.textContent = `${longName}: ${v.toLocaleString()}`;
        p.appendChild(title);
        svg.appendChild(p);

        // 시도명 라벨 (centroid 위치)
        try {
          const centroid = path.centroid(f as unknown as GeoPermissibleObjects);
          if (centroid && !isNaN(centroid[0])) {
            const lbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            lbl.setAttribute('x', String(centroid[0]));
            lbl.setAttribute('y', String(centroid[1]));
            lbl.setAttribute('text-anchor', 'middle');
            lbl.setAttribute('fill', '#f1f5f9');
            lbl.setAttribute('font-size', '10');
            lbl.setAttribute('font-weight', '600');
            lbl.setAttribute('pointer-events', 'none');
            // 짧은 시도명만 표시 (longName → short)
            const short = Object.entries(SHORT_TO_LONG).find(([_, l]) => l === longName)?.[0] ?? longName;
            lbl.textContent = short;
            svg.appendChild(lbl);
            if (v > 0) {
              const valText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
              valText.setAttribute('x', String(centroid[0]));
              valText.setAttribute('y', String(centroid[1] + 12));
              valText.setAttribute('text-anchor', 'middle');
              valText.setAttribute('fill', '#fde68a');
              valText.setAttribute('font-size', '9');
              valText.setAttribute('pointer-events', 'none');
              valText.textContent = String(v);
              svg.appendChild(valText);
            }
          }
        } catch {
          /* skip */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data, geoUrl]);
  return <svg ref={ref} className="w-full h-[640px] rounded-lg border border-ink-700 bg-ink-950" />;
}
