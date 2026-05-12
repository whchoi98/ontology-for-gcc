'use client';
import { useEffect, useRef } from 'react';

/** 1-hop subgraph visualizer — 다크 테마 호환 (배경/노드/엣지 색상). */
const NODE_PALETTE: Record<string, string> = {
  Customer:           '#60a5fa',
  Persona:            '#34d399',
  Cluster:            '#fbbf24',
  Segment:            '#a78bfa',
  Member:             '#22d3ee',
  FuelTransaction:    '#fb923c',
  AppEvent:           '#0ea5e9',
  SurveyResponse:     '#facc15',
  CouponUse:          '#f472b6',
  Campaign:           '#f87171',
  Coupon:             '#c084fc',
  Offer:              '#fbbf24',
  Channel:            '#94a3b8',
  CampaignSms:        '#38bdf8',
  PaymentMethod:      '#14b8a6',
  GasStation:         '#0ea5e9',
  FuelProduct:        '#fb923c',
  FuelPrice:          '#86efac',
  Region:             '#38bdf8',
  Term:               '#a5b4fc',
  TermAgreement:      '#fda4af',
  ConsumptionIndex:   '#fde047',
  WeatherObservation: '#bfdbfe',
  TimeSlot:           '#a3e635',
};

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
        ...nodes.map((n) => ({
          data: {
            id: n.id,
            label: n.label ?? n.id,
            color: NODE_PALETTE[n.label ?? ''] ?? '#94a3b8',
          },
        })),
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
              'background-color': 'data(color)',
              'border-width': 2,
              'border-color': '#1e293b',
              'font-size': 10,
              color: '#f1f5f9',
              'text-valign': 'center',
              'text-halign': 'center',
              'text-outline-color': '#0f172a',
              'text-outline-width': 2,
              width: 36,
              height: 36,
            },
          },
          {
            selector: 'edge',
            style: {
              width: 1.2,
              'line-color': '#475569',
              label: 'data(label)',
              'curve-style': 'bezier',
              'target-arrow-shape': 'triangle',
              'target-arrow-color': '#475569',
              'font-size': 9,
              color: '#cbd5e1',
              'text-background-color': '#0f172a',
              'text-background-opacity': 0.7,
              'text-background-padding': '2px',
            },
          },
        ],
        layout: { name: 'cose', animate: false, padding: 30 },
      });
    })();
    return () => {
      cy?.destroy();
    };
  }, [nodes, edges]);
  return (
    <div
      ref={ref}
      className="w-full h-[420px] rounded-lg border border-ink-700 bg-ink-950"
    />
  );
}
