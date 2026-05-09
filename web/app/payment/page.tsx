// web/app/payment/page.tsx — 시나리오 L: 결제·가격·채널 분석
'use client';
import { useState } from 'react';
import DataSourceBadge from '../../components/DataSourceBadge';
import PersonaSwitchGcc from '../../components/PersonaSwitchGcc';

type Row = {
  payment?: string;
  grade?: string;
  sido?: string;
  tx?: number;
  revenue?: number;
  avg_price?: number;
};

export default function PaymentPage() {
  const [persona, setPersona] = useState('retail-ops');
  const [grade, setGrade] = useState('');
  const [sido, setSido] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  async function go() {
    setLoading(true);
    const r = await fetch('/api/payment/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        persona_id: persona,
        fuel_grade: grade || null,
        sido_nm: sido || null,
      }),
    });
    setRows(((await r.json()).matrix || []) as Row[]);
    setLoading(false);
  }
  return (
    <div className='p-8 max-w-6xl mx-auto'>
      <h1 className='text-2xl font-bold mb-2'>L. 결제 · 가격 · 채널 분석</h1>
      <PersonaSwitchGcc value={persona} onChange={setPersona} />
      <div className='flex gap-2 mt-3 mb-2'>
        <DataSourceBadge source='real' />
        <DataSourceBadge source='synthetic' />
      </div>
      <div className='flex gap-2 mb-3'>
        <select
          className='border rounded px-2'
          value={grade}
          onChange={(e) => setGrade(e.target.value)}
        >
          <option value=''>모든 유종</option>
          <option>regular</option>
          <option>premium</option>
          <option>diesel</option>
          <option>kerosene</option>
          <option>lpg</option>
        </select>
        <input
          className='border rounded px-2'
          placeholder='시도 (선택)'
          value={sido}
          onChange={(e) => setSido(e.target.value)}
        />
        <button
          onClick={go}
          disabled={loading}
          className='bg-blue-600 text-white px-4 py-1 rounded'
        >
          {loading ? '분석 중...' : '분석'}
        </button>
      </div>
      <table className='w-full text-sm'>
        <thead>
          <tr className='border-b'>
            <th className='text-left'>결제</th>
            <th className='text-left'>유종</th>
            <th className='text-left'>시도</th>
            <th className='text-right'>거래수</th>
            <th className='text-right'>매출</th>
            <th className='text-right'>평균가</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className='border-b'>
              <td>{r.payment ?? '-'}</td>
              <td>{r.grade ?? '-'}</td>
              <td>{r.sido ?? '-'}</td>
              <td className='text-right'>{r.tx?.toLocaleString?.() ?? 0}</td>
              <td className='text-right'>
                {r.revenue?.toLocaleString?.() ?? 0}
              </td>
              <td className='text-right'>{Math.round(r.avg_price || 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
