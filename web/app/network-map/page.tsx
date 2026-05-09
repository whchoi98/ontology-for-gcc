// web/app/network-map/page.tsx — 시나리오 H: 주유소 네트워크 지도
'use client';
import { useEffect, useState } from 'react';
import KoreaChoropleth from '../../components/KoreaChoropleth';
import PersonaSwitchGcc from '../../components/PersonaSwitchGcc';
import DataSourceBadge from '../../components/DataSourceBadge';

type Row = {
  sido?: string;
  brand?: string;
  stations?: number;
  avg_price?: number;
};

export default function NetworkMapPage() {
  const [persona, setPersona] = useState('retail-ops');
  const [byBrand, setByBrand] = useState<Row[]>([]);
  const [data, setData] = useState<Record<string, number>>({});
  useEffect(() => {
    fetch('/api/network-map/map', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ persona_id: persona }),
    })
      .then((r) => r.json())
      .then((j: { stations_by_sido?: Row[] }) => {
        const rows = j.stations_by_sido || [];
        setByBrand(rows);
        const m: Record<string, number> = {};
        for (const r of rows) {
          if (!r.sido) continue;
          m[r.sido] = (m[r.sido] ?? 0) + (r.stations ?? 0);
        }
        setData(m);
      })
      .catch(() => {
        setByBrand([]);
        setData({});
      });
  }, [persona]);
  return (
    <div className='p-8 max-w-6xl mx-auto'>
      <h1 className='text-2xl font-bold mb-2'>H. 주유소 네트워크 지도</h1>
      <PersonaSwitchGcc value={persona} onChange={setPersona} />
      <div className='flex gap-2 mt-3 mb-3'>
        <DataSourceBadge source='real' />
        <DataSourceBadge source='synthetic' />
      </div>
      <div className='grid grid-cols-2 gap-4'>
        <KoreaChoropleth data={data} />
        <div className='border rounded p-3 text-sm'>
          <div className='font-semibold mb-2'>시도별 브랜드 분포</div>
          <table className='w-full text-xs'>
            <thead>
              <tr className='border-b text-left'>
                <th>시도</th>
                <th>브랜드</th>
                <th className='text-right'>주유소</th>
                <th className='text-right'>평균가</th>
              </tr>
            </thead>
            <tbody>
              {byBrand.map((r, i) => (
                <tr key={i} className='border-b'>
                  <td>{r.sido ?? '-'}</td>
                  <td>{r.brand ?? '-'}</td>
                  <td className='text-right'>{r.stations ?? 0}</td>
                  <td className='text-right'>
                    {Math.round(r.avg_price || 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
