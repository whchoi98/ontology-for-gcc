'use client';

type Row = {
  sido?: string;
  rain?: number;
  tx_count?: number;
};

export default function WeatherOverlay({ rows }: { rows: Row[] }) {
  const bySido: Record<string, { rain: number; tx: number }> = {};
  for (const r of rows) {
    const k = r.sido ?? '?';
    bySido[k] = bySido[k] ?? { rain: 0, tx: 0 };
    bySido[k].rain += r.rain || 0;
    bySido[k].tx += r.tx_count || 0;
  }
  const entries = Object.entries(bySido);
  return (
    <table className='w-full text-sm'>
      <thead>
        <tr className='border-b text-left'>
          <th>시도</th>
          <th className='text-right'>총 강수</th>
          <th className='text-right'>거래</th>
        </tr>
      </thead>
      <tbody>
        {entries.length === 0 && (
          <tr>
            <td colSpan={3} className='py-2 text-slate-400'>
              데이터 없음
            </td>
          </tr>
        )}
        {entries.map(([k, v]) => (
          <tr key={k} className='border-b'>
            <td>{k}</td>
            <td className='text-right'>{v.rain.toFixed(1)}</td>
            <td className='text-right'>{v.tx}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
