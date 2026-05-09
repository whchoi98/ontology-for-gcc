'use client';
import { useEffect, useState } from 'react';
import SubgraphView from '../../../../components/SubgraphView';
import DataSourceBadge from '../../../../components/DataSourceBadge';

export default function ObjectDetail({ params }: { params: { type: string; id: string } }) {
  const [obj, setObj] = useState<any>(null);
  const [graph, setGraph] = useState<{ nodes: any[]; edges: any[] }>({ nodes: [], edges: [] });

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_BASE ?? '/api';
    fetch(`${base}/objects/${params.type}/${params.id}`)
      .then((r) => r.json())
      .then(setObj)
      .catch(() => setObj(null));
    fetch(`${base}/objects/${params.type}/${params.id}/subgraph`)
      .then((r) => r.json())
      .then((d) => setGraph(d.subgraph || { nodes: [], edges: [] }))
      .catch(() => setGraph({ nodes: [], edges: [] }));
  }, [params.type, params.id]);

  const props =
    (obj?.subgraph?.[0]?.n?.['~properties'] as Record<string, unknown>) ??
    (obj as Record<string, unknown>) ??
    {};

  return (
    <div className='p-8 max-w-6xl mx-auto'>
      <div className='flex items-center gap-2 mb-2 flex-wrap'>
        <h1 className='text-2xl font-bold capitalize'>{params.type}</h1>
        <span className='text-base font-mono text-slate-500'>· {params.id}</span>
      </div>
      <div className='flex gap-2 mb-4'>
        <DataSourceBadge source='real'/>
        <DataSourceBadge source='synthetic'/>
        <DataSourceBadge source='external'/>
      </div>
      <div className='grid grid-cols-3 gap-4'>
        <div className='col-span-1 border rounded p-3 text-sm space-y-1 max-h-[600px] overflow-y-auto bg-slate-50'>
          <div className='font-semibold mb-2'>속성 ({Object.keys(props).length})</div>
          {Object.entries(props).map(([k, v]: any) => (
            <div key={k} className='border-b pb-1 text-xs'>
              <div className='font-mono text-slate-500'>{k}</div>
              <div className='break-all'>{String(v).slice(0, 200)}</div>
            </div>
          ))}
        </div>
        <div className='col-span-2'>
          <div className='font-semibold mb-2'>
            1-hop Subgraph ({graph.nodes.length} 노드 · {graph.edges.length} 엣지)
          </div>
          <SubgraphView nodes={graph.nodes} edges={graph.edges}/>
        </div>
      </div>
    </div>
  );
}
