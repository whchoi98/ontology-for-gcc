// web/app/persona-match/page.tsx — 시나리오 D: 페르소나 매칭
'use client';
import { useState } from 'react';
import DataSourceBadge from '../../components/DataSourceBadge';
import PersonaSwitchGcc from '../../components/PersonaSwitchGcc';

type Match = {
  cust_id: string;
  best_persona: string;
  all_scores: Record<string, number>;
};

export default function PersonaMatchPage() {
  const [persona, setPersona] = useState('marketing');
  const [csv, setCsv] = useState('c001,c002,c003');
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(false);
  async function go() {
    setLoading(true);
    const r = await fetch('/api/persona-match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cust_ids: csv.split(',').map((s) => s.trim()),
        persona_id: persona,
      }),
    });
    setMatches(((await r.json()).matches || []) as Match[]);
    setLoading(false);
  }
  const scoreKeys = matches[0]?.all_scores
    ? Object.keys(matches[0].all_scores)
    : [];
  return (
    <div className='p-8 max-w-6xl mx-auto'>
      <h1 className='text-2xl font-bold mb-2'>D. 페르소나 매칭</h1>
      <div className='flex items-center gap-3 mb-4'>
        <PersonaSwitchGcc value={persona} onChange={setPersona} />
        <DataSourceBadge source='real' />
        <DataSourceBadge source='synthetic' />
      </div>
      <textarea
        className='w-full border rounded p-2 mb-2'
        rows={3}
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
        placeholder='cust_id를 쉼표로 구분'
      />
      <button
        onClick={go}
        disabled={loading}
        className='bg-blue-600 text-white px-4 py-2 rounded'
      >
        {loading ? '매칭 중...' : '매칭'}
      </button>
      {matches.length > 0 && (
        <table className='w-full mt-4 text-sm'>
          <thead>
            <tr className='border-b text-left'>
              <th className='py-2'>cust_id</th>
              <th>best_persona</th>
              {scoreKeys.map((k) => (
                <th key={k} className='text-right'>
                  {k}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matches.map((m, i) => (
              <tr key={i} className='border-b'>
                <td className='py-1 font-mono text-xs'>{m.cust_id}</td>
                <td className='font-semibold'>{m.best_persona}</td>
                {scoreKeys.map((k) => (
                  <td key={k} className='text-right font-mono text-xs'>
                    {m.all_scores[k]?.toFixed?.(3) ?? '-'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
