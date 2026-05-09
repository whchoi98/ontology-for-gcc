// web/app/weather/page.tsx — 시나리오 N: 날씨 × 주유 패턴 (기상청 단기예보)
'use client';
import { useState } from 'react';
import ChartImage from '../../components/ChartImage';
import WeatherOverlay from '../../components/WeatherOverlay';
import PersonaSwitchGcc from '../../components/PersonaSwitchGcc';
import DataSourceBadge from '../../components/DataSourceBadge';

type Row = {
  sido?: string;
  dt?: string;
  temp?: number;
  rain?: number;
  tx_count?: number;
  rev?: number;
};

type CorrOut = {
  rows?: Row[];
  chart_png_b64?: string;
};

export default function WeatherPage() {
  const [persona, setPersona] = useState('data-ai');
  const [sido, setSido] = useState('');
  const [out, setOut] = useState<CorrOut | null>(null);
  const [loading, setLoading] = useState(false);
  async function go() {
    setLoading(true);
    const r = await fetch('/api/weather/correlate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ persona_id: persona, sido_nm: sido || null }),
    });
    setOut((await r.json()) as CorrOut);
    setLoading(false);
  }
  return (
    <div className='p-8 max-w-6xl mx-auto'>
      <h1 className='text-2xl font-bold mb-2'>
        N. 날씨 × 주유 패턴 (기상청 단기예보)
      </h1>
      <PersonaSwitchGcc value={persona} onChange={setPersona} />
      <div className='flex gap-2 mt-3 mb-3'>
        <DataSourceBadge source='external' />
        <DataSourceBadge source='real' />
        <DataSourceBadge source='synthetic' />
      </div>
      <div className='flex gap-2 mb-3'>
        <input
          className='border rounded px-2'
          placeholder='시도 (선택, 미입력=전체)'
          value={sido}
          onChange={(e) => setSido(e.target.value)}
        />
        <button
          onClick={go}
          disabled={loading}
          className='bg-blue-600 text-white px-4 py-2 rounded'
        >
          {loading ? '분석 중...' : '상관분석'}
        </button>
      </div>
      {out && (
        <div className='grid grid-cols-2 gap-4'>
          <ChartImage base64Png={out.chart_png_b64} loading={loading} />
          <WeatherOverlay rows={out.rows || []} />
        </div>
      )}
    </div>
  );
}
