'use client';
import { useEffect, useRef } from 'react';

/** Plan 3 Task 3.2.3 — Cytoscape 1-hop subgraph visualizer.
 *  Receives nodes/edges flattened by api/services/search_pipeline._hop1_subgraph. */
export default function SubgraphView({
  nodes,
  edges,
}: {
  nodes: { id: string; label?: string; props?: Record<string, unknown> }[];
  edges: { id?: string; source: string; target: string; type?: string }[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    let cy: { destroy: () => void } | undefined;
    (async () => {
      const cytoscape = (await import('cytoscape')).default;
      const elements = [
        ...nodes.map((n) => ({ data: { id: n.id, label: n.label ?? n.id } })),
        ...edges.map((e, i) => ({
          data: {
            id: e.id ?? `e-${i}`,
            source: e.source,
            target: e.target,
            label: e.type ?? '',
          },
        })),
      ];
      cy = cytoscape({
        container: ref.current!,
        elements,
        style: [
          {
            selector: 'node',
            style: {
              label: 'data(label)',
              'background-color': '#3b82f6',
              'font-size': 10,
              color: '#0f172a',
              'text-valign': 'center',
              'text-halign': 'center',
            },
          },
          {
            selector: 'edge',
            style: {
              width: 1,
              'line-color': '#9ca3af',
              label: 'data(label)',
              'curve-style': 'bezier',
              'target-arrow-shape': 'triangle',
              'target-arrow-color': '#9ca3af',
              'font-size': 9,
              color: '#475569',
            },
          },
        ],
        layout: { name: 'cose', animate: false },
      });
    })();
    return () => {
      cy?.destroy();
    };
  }, [nodes, edges]);
  return <div ref={ref} className="w-full h-[400px] border rounded bg-slate-50" />;
}
