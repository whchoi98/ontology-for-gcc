// web/app/outlier/page.tsx — 시나리오 K: Outlier · 행동 변화 탐지 (PDF 3 시그니처)
'use client';
import { useState } from 'react';
import PersonaSwitchGcc from '../../components/PersonaSwitchGcc';
import DataSourceBadge from '../../components/DataSourceBadge';

const PATTERNS: [string, string][] = [
  ['pm_m_mixing', 'PM+M 혼유 (92 RON DIY)'],
  ['fuel_grade_transition', '유종 전환 (디젤→고급)'],
  ['app_signup_after_install', '앱 설치 후 가입'],
];

type DetectOut = {
  pattern?: string;
  count?: number;
  matches?: Record<string, unknown>[];
  note?: string;
};

export default function OutlierPage() {
  const [persona, setPersona] = useState('data-ai');
  const [pattern, setPattern] = useState('pm_m_mixing');
  const [out, setOut] = useState<DetectOut | null>(null);
  const [loading, setLoading] = useState(false);
  async function go() {
    setLoading(true);
    const r = await fetch('/api/outlier/detect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pattern, persona_id: persona }),
    });
    setOut((await r.json()) as DetectOut);
    setLoading(false);
  }
  const matchCount = out?.count ?? out?.matches?.length ?? 0;
  return (
    <div className='p-8 max-w-6xl mx-auto'>
      <h1 className='text-2xl font-bold mb-2'>K. Outlier · 행동 변화 탐지</h1>
      <p className='text-sm text-slate-600 mb-3'>
        PDF 3페이지의 PM+M 92 RON DIY · 디젤→premium 전환 시그니처 검출.
      </p>
      <PersonaSwitchGcc value={persona} onChange={setPersona} />
      <div className='flex gap-2 mt-3 mb-3'>
        <DataSourceBadge source='real' />
        <DataSourceBadge source='synthetic' />
      </div>
      <div className='flex gap-2 mb-3 flex-wrap'>
        {PATTERNS.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setPattern(id)}
            className={`text-xs px-3 py-2 rounded border ${
              pattern === id
                ? 'bg-amber-500 text-white'
                : 'bg-white text-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
        <button
          onClick={go}
          disabled={loading}
          className='bg-blue-600 text-white px-4 py-2 rounded ml-auto'
        >
          {loading ? '탐지 중...' : '탐지 실행'}
        </button>
      </div>
      {out && (
        <div className='border rounded p-3'>
          <div className='font-semibold mb-2'>매치 ({matchCount})</div>
          <div className='text-xs text-slate-500 mb-2'>{out.note}</div>
          <table className='w-full text-xs'>
            <tbody>
              {(out.matches || []).slice(0, 30).map((m, i) => (
                <tr key={i} className='border-b'>
                  {Object.entries(m).map(([k, v]) => (
                    <td key={k} className='py-1 px-2 font-mono'>
                      {String(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
