'use client';
import { useEffect, useRef } from 'react';
import type { GeoPermissibleObjects, GeoProjection } from 'd3-geo';

type Props = {
  data: Record<string, number>;
  geoUrl?: string;
};

export default function KoreaChoropleth({
  data,
  geoUrl = '/geo/kostat-sido-2024.geojson',
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
      // Safely clear existing children (no innerHTML to satisfy security hooks)
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
        properties?: { SIDO_NM?: string; name?: string };
      }>) || [];
      if (features.length === 0) {
        const txt = document.createElementNS(
          'http://www.w3.org/2000/svg',
          'text',
        );
        txt.setAttribute('x', String(w / 2));
        txt.setAttribute('y', String(h / 2));
        txt.setAttribute('text-anchor', 'middle');
        txt.setAttribute('fill', '#64748b');
        txt.setAttribute('font-size', '14');
        txt.textContent =
          '시도 GeoJSON 미설치 — Plan 5 polish에서 KOSTAT 데이터 추가';
        svg.appendChild(txt);
        return;
      }
      for (const f of features) {
        const sido =
          (f.properties?.SIDO_NM ?? f.properties?.name ?? '') as string;
        const v = data[sido] ?? 0;
        const fill = `rgba(59,130,246,${Math.min(v / 100, 0.9)})`;
        const p = document.createElementNS(
          'http://www.w3.org/2000/svg',
          'path',
        );
        const dStr = path(f as unknown as GeoPermissibleObjects) || '';
        p.setAttribute('d', dStr);
        p.setAttribute('fill', fill);
        p.setAttribute('stroke', '#999');
        p.setAttribute('stroke-width', '0.5');
        const title = document.createElementNS(
          'http://www.w3.org/2000/svg',
          'title',
        );
        title.textContent = `${sido}: ${v}`;
        p.appendChild(title);
        svg.appendChild(p);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data, geoUrl]);
  return <svg ref={ref} className='w-full h-[600px] border rounded' />;
}
