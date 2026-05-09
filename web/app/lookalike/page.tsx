// web/app/lookalike/page.tsx — 시나리오 F: 룩어라이크 익스팬션
'use client';
import { useState } from 'react';
import DataSourceBadge from '../../components/DataSourceBadge';
import PersonaSwitchGcc from '../../components/PersonaSwitchGcc';

type LookalikeOut = {
  count?: number;
  expanded?: string[];
  error?: string;
};

export default function LookalikePage() {
  const [persona, setPersona] = useState('data-ai');
  const [seeds, setSeeds] = useState('c001,c016,c021');
  const [pct, setPct] = useState(0.2);
  const [out, setOut] = useState<LookalikeOut | null>(null);
  const [loading, setLoading] = useState(false);
  async function go() {
    setLoading(true);
    const r = await fetch('/api/lookalike', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        seed_cust_ids: seeds.split(',').map((s) => s.trim()),
        top_pct: pct,
        persona_id: persona,
      }),
    });
    setOut((await r.json()) as LookalikeOut);
    setLoading(false);
  }
  return (
    <div className='p-8 max-w-6xl mx-auto'>
      <h1 className='text-2xl font-bold mb-2'>F. 룩어라이크 익스팬션</h1>
      <div className='flex items-center gap-3 mb-4'>
        <PersonaSwitchGcc value={persona} onChange={setPersona} />
        <DataSourceBadge source='synthetic' />
      </div>
      <textarea
        className='w-full border rounded p-2 mb-2'
        rows={2}
        value={seeds}
        onChange={(e) => setSeeds(e.target.value)}
        placeholder='seed cust_id (쉼표 구분)'
      />
      <div className='flex gap-3 items-center'>
        <label className='text-sm'>
          상위 비율
          <input
            type='number'
            step='0.05'
            min='0.05'
            max='1'
            value={pct}
            onChange={(e) => setPct(parseFloat(e.target.value))}
            className='border rounded px-2 w-24 ml-2'
          />
        </label>
        <button
          onClick={go}
          disabled={loading}
          className='bg-blue-600 text-white px-4 py-2 rounded'
        >
          {loading ? '확장 중...' : '확장'}
        </button>
      </div>
      {out && (
        <div className='mt-4 border rounded p-3'>
          <div className='text-lg'>
            총 확장: <span className='font-semibold'>{out.count ?? 0}</span>
          </div>
          <div className='text-xs font-mono text-slate-500 mt-2 break-all'>
            샘플: {out.expanded?.slice(0, 20).join(', ')}
          </div>
          {out.error && (
            <div className='mt-2 text-rose-700 text-xs font-mono'>
              error: {out.error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
