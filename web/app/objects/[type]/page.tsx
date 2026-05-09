import DataSourceBadge from '../../../components/DataSourceBadge';

async function fetchType(type: string, page = 1) {
  const base = process.env.NEXT_PUBLIC_API_BASE ?? '/api';
  const r = await fetch(`${base}/objects/${type}?page=${page}&size=50`,
                       { next: { revalidate: 60 }});
  return r.json();
}

export default async function ObjectsPage({ params }: { params: { type: string }}) {
  const data = await fetchType(params.type);
  return (
    <div className='p-8'>
      <h1 className='text-2xl font-bold capitalize'>{params.type} <span className='text-base text-slate-500'>({data.items?.length ?? 0} of page {data.page ?? 1})</span></h1>
      <div className='my-3'><DataSourceBadge source='real' /></div>
      <table className='w-full border-collapse text-sm'>
        <tbody>
          {(data.items || []).map((it: any, i: number) => (
            <tr key={i} className='border-b'>
              <td className='py-1 pr-2 font-mono text-xs text-slate-400'>{i+1}</td>
              <td className='py-1'>{JSON.stringify(it).slice(0, 200)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
