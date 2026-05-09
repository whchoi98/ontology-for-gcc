// web/app/external-signal/page.tsx — 시나리오 J: 외부 시그널 통합 (현대카드·앱·설문·날씨)
'use client';
import { useState } from 'react';
import PersonaSwitchGcc from '../../components/PersonaSwitchGcc';
import DataSourceBadge from '../../components/DataSourceBadge';

type FuseOut = {
  fused_rows?: unknown[];
  narrative?: string;
};

export default function ExternalSignalPage() {
  const [persona, setPersona] = useState('strategy');
  const [cid, setCid] = useState('');
  const [out, setOut] = useState<FuseOut | null>(null);
  const [loading, setLoading] = useState(false);
  async function go() {
    setLoading(true);
    const r = await fetch('/api/external-signal/fuse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ persona_id: persona, cust_id: cid || null }),
    });
    setOut((await r.json()) as FuseOut);
    setLoading(false);
  }
  return (
    <div className='p-8 max-w-5xl mx-auto'>
      <h1 className='text-2xl font-bold mb-2'>
        J. 외부 시그널 통합 (현대카드·앱·설문·날씨)
      </h1>
      <PersonaSwitchGcc value={persona} onChange={setPersona} />
      <div className='flex gap-2 mt-3 mb-3'>
        <DataSourceBadge source='external' />
        <DataSourceBadge source='real' />
        <DataSourceBadge source='synthetic' />
      </div>
      <div className='flex gap-2 mb-3'>
        <input
          className='border rounded px-2 flex-1'
          placeholder='cust_id (없으면 cohort 평균)'
          value={cid}
          onChange={(e) => setCid(e.target.value)}
        />
        <button
          onClick={go}
          disabled={loading}
          className='bg-blue-600 text-white px-4 py-2 rounded'
        >
          {loading ? '융합 중...' : '융합 분석'}
        </button>
      </div>
      {out && (
        <>
          <pre className='border rounded p-3 bg-slate-50 text-xs overflow-auto max-h-60'>
            {JSON.stringify(out.fused_rows, null, 2)}
          </pre>
          <div className='border rounded p-3 mt-3 whitespace-pre-wrap'>
            {out.narrative}
          </div>
        </>
      )}
    </div>
  );
}
