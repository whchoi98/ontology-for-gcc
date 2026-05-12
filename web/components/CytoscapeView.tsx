// web/components/CytoscapeView.tsx
"use client";
import { useEffect, useRef, useState } from "react";
import cytoscape, { ElementsDefinition, NodeSingular } from "cytoscape";
import { X } from "lucide-react";
import type { CytoscapeGraph } from "@/lib/types";

interface Props {
  graph: CytoscapeGraph;
  /** Node IDs to highlight as the user-selected/anchor node (orange ring + size boost). */
  anchorIds?: string[];
  onNodeTap?: (nodeId: string, nodeLabel: string) => void;
  height?: number | string;
}

export function CytoscapeView({ graph, anchorIds = [], onNodeTap, height = 480 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<{ id: string; data: Record<string, unknown> } | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  // Stable ref for the tap callback so the cytoscape effect doesn't reinitialize
  // every render (parent components recreate the function on each render).
  const onNodeTapRef = useRef(onNodeTap);
  onNodeTapRef.current = onNodeTap;

  useEffect(() => {
    if (!ref.current) return;
    setRenderError(null);

    // Preprocess nodes — ensure every node has `name_ko` populated for the label,
    // and dedupe by id so cytoscape doesn't throw on duplicates from upstream.
    const seenNodeIds = new Set<string>();
    const enrichedNodes: { data: Record<string, unknown> }[] = [];
    for (const n of graph.nodes ?? []) {
      const d = (n.data ?? {}) as Record<string, unknown>;
      const id = String(d.id ?? "");
      if (!id || seenNodeIds.has(id)) continue;
      seenNodeIds.add(id);
      const fallbackName =
        (d.name_ko as string) ||
        (d.name as string) ||
        (d.title as string) ||
        (id.length > 8 ? `${(d.label as string) || ""} ${id.slice(-8)}` : id);
      enrichedNodes.push({ data: { ...d, name_ko: fallbackName } });
    }

    // Drop edges whose source or target isn't in the node set — Cytoscape throws
    // synchronously on dangling refs, which manifested as the Next.js
    // "Application error: a client-side exception" overlay.
    const seenEdgeIds = new Set<string>();
    const validEdges: { data: Record<string, unknown> }[] = [];
    for (const e of graph.edges ?? []) {
      const d = (e.data ?? {}) as Record<string, unknown>;
      const eid = String(d.id ?? "");
      const src = String(d.source ?? "");
      const tgt = String(d.target ?? "");
      if (!src || !tgt || !seenNodeIds.has(src) || !seenNodeIds.has(tgt)) continue;
      if (eid && seenEdgeIds.has(eid)) continue;
      if (eid) seenEdgeIds.add(eid);
      validEdges.push({ data: d });
    }

    const elements: ElementsDefinition = {
      nodes: enrichedNodes as ElementsDefinition["nodes"],
      edges: validEdges as ElementsDefinition["edges"],
    };

    let cy: cytoscape.Core;
    try {
      cy = cytoscape({
      container: ref.current,
      elements,
      style: [
        {
          selector: "node",
          style: {
            "background-color": "#3b82f6",
            label: "data(name_ko)",
            "font-size": "11px",
            "text-wrap": "wrap",
            "text-max-width": "100",
            color: "#e2e8f0",
            "text-valign": "bottom",
            "text-margin-y": 4,
            width: 36,
            height: 36,
            "border-width": 2,
            "border-color": "#1e293b",
          },
        },
        {
          selector: "edge",
          style: {
            label: "data(type)",
            "font-size": "8px",
            color: "#64748b",
            width: 1,
            "line-color": "#475569",
            "target-arrow-color": "#475569",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            "text-rotation": "autorotate",
          },
        },
        // ── GCC 25 클래스 — 5 도메인 그룹 색상 패밀리 ───────────────
        // 고객·회원 (5) — 오렌지/앰버
        { selector: 'node[label = "Customer"]',            style: { "background-color": "#fb923c", shape: "round-rectangle" } },
        { selector: 'node[label = "Persona"]',             style: { "background-color": "#f97316", shape: "hexagon" } },
        { selector: 'node[label = "Cluster"]',             style: { "background-color": "#fdba74", shape: "ellipse" } },
        { selector: 'node[label = "Segment"]',             style: { "background-color": "#fcd34d", shape: "tag" } },
        { selector: 'node[label = "Member"]',              style: { "background-color": "#fbbf24", shape: "round-rectangle" } },
        // 행동·거래 (5) — 블루/시안
        { selector: 'node[label = "FuelTransaction"]',     style: { "background-color": "#38bdf8", shape: "rectangle" } },
        { selector: 'node[label = "AppEvent"]',            style: { "background-color": "#60a5fa", shape: "ellipse" } },
        { selector: 'node[label = "Survey"]',              style: { "background-color": "#0ea5e9", shape: "round-rectangle" } },
        { selector: 'node[label = "SurveyResponse"]',      style: { "background-color": "#0ea5e9", shape: "round-rectangle" } },
        { selector: 'node[label = "CouponUse"]',           style: { "background-color": "#22d3ee", shape: "diamond" } },
        { selector: 'node[label = "PaymentMethod"]',       style: { "background-color": "#06b6d4", shape: "hexagon" } },
        // 마케팅 (6) — 핑크/퍼플
        { selector: 'node[label = "Campaign"]',            style: { "background-color": "#d946ef", shape: "round-rectangle" } },
        { selector: 'node[label = "Coupon"]',              style: { "background-color": "#f472b6", shape: "tag" } },
        { selector: 'node[label = "Offer"]',               style: { "background-color": "#a78bfa", shape: "tag" } },
        { selector: 'node[label = "Channel"]',             style: { "background-color": "#c084fc", shape: "octagon" } },
        { selector: 'node[label = "CampaignSMS"]',         style: { "background-color": "#ec4899", shape: "round-rectangle" } },
        { selector: 'node[label = "CampaignSms"]',         style: { "background-color": "#ec4899", shape: "round-rectangle" } },
        { selector: 'node[label = "CampaignAggregation"]', style: { "background-color": "#818cf8", shape: "octagon" } },
        // 운영·상품 (4) — 그린/시안 (틸 패밀리)
        { selector: 'node[label = "FuelProduct"]',         style: { "background-color": "#34d399", shape: "rectangle" } },
        { selector: 'node[label = "GasStation"]',          style: { "background-color": "#10b981", shape: "round-rectangle" } },
        { selector: 'node[label = "FuelPrice"]',           style: { "background-color": "#14b8a6", shape: "ellipse" } },
        { selector: 'node[label = "Region"]',              style: { "background-color": "#2dd4bf", shape: "hexagon" } },
        // 컴플·외부 (4) — 옐로/라임/앰버
        { selector: 'node[label = "Term"]',                style: { "background-color": "#fde047", shape: "pentagon" } },
        { selector: 'node[label = "TermAgreement"]',       style: { "background-color": "#facc15", shape: "tag" } },
        { selector: 'node[label = "ConsumptionIndex"]',    style: { "background-color": "#f59e0b", shape: "round-rectangle" } },
        { selector: 'node[label = "WeatherObservation"]',  style: { "background-color": "#84cc16", shape: "ellipse" } },
        // 시간 (1) — 회색
        { selector: 'node[label = "TimeSlot"]',            style: { "background-color": "#9ca3af", shape: "ellipse" } },
        // Anchor highlighting (the user-selected node from list selection)
        {
          selector: "node.anchor",
          style: {
            "border-color": "#ff6b35",
            "border-width": 4,
            width: 48,
            height: 48,
            "z-index": 10,
          },
        },
        {
          selector: "node:selected",
          style: { "border-width": 3, "border-color": "#fb923c", "border-opacity": 1 },
        },
      ],
        layout: { name: "concentric", animate: false, minNodeSpacing: 16 },
      });
    } catch (err) {
      // Last-resort guard — even after dedup/dangling-edge filtering, malformed
      // styles or container state could throw. Surface a readable message
      // instead of letting Next.js render the global error overlay.
      const msg = err instanceof Error ? err.message : String(err);
      console.error("CytoscapeView: cytoscape() threw —", err);
      setRenderError(msg);
      return;
    }

    // Fit to viewport with padding so graphs always render at a sensible size,
    // regardless of node count (5 nodes vs 50 nodes).
    cy.ready(() => {
      cy.fit(undefined, 40);
      // Cap zoom so very small graphs don't fill the canvas with one giant node
      if (cy.zoom() > 1.2) cy.zoom(1.2);
      cy.center();
    });

    if (anchorIds.length > 0) {
      anchorIds.forEach((nid) => {
        const n = cy.getElementById(nid);
        if (n.length) n.addClass("anchor");
      });
    }

    cy.on("tap", "node", (evt) => {
      const node = evt.target as NodeSingular;
      const data = node.data() as Record<string, unknown>;
      setSelected({ id: String(data.id ?? ""), data });
      const cb = onNodeTapRef.current;
      if (cb) cb(String(data.id ?? ""), String(data.label ?? ""));
    });

    cy.on("tap", (evt) => {
      if (evt.target === cy) setSelected(null);
    });

    return () => cy.destroy();
    // `onNodeTap` intentionally omitted — accessed via onNodeTapRef so the
    // cytoscape instance isn't torn down on every parent re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, anchorIds]);

  return (
    <div className="relative w-full h-full">
      <div
        ref={ref}
        className="w-full border border-ink-700 rounded-lg bg-ink-950"
        style={{ height: typeof height === "number" ? `${height}px` : height, minHeight: 400 }}
      />
      {renderError && (
        <div className="absolute inset-2 flex items-center justify-center px-4 rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-200 text-xs text-center">
          그래프 렌더링 실패 — {renderError}
        </div>
      )}
      {selected && (
        <div className="absolute top-2 right-2 w-72 bg-ink-900 border border-ink-700 rounded-lg shadow-xl p-4 z-10">
          <div className="flex items-start justify-between mb-2">
            <h4 className="text-sm font-semibold text-accent-300">
              {String(selected.data.label ?? "Node")}
            </h4>
            <button onClick={() => setSelected(null)} className="text-ink-400 hover:text-ink-200 transition ml-2 shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="text-xs font-mono text-ink-400 mb-3 break-all">{selected.id}</div>
          <dl className="space-y-1.5 text-xs">
            {Object.entries(selected.data)
              .filter(([k]) => !["id", "label", "name_ko"].includes(k))
              .slice(0, 12)
              .map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2">
                  <dt className="text-ink-400 shrink-0 font-medium">{k}:</dt>
                  <dd className="text-ink-200 truncate text-right">
                    {v == null ? "—" : String(v).slice(0, 60)}
                  </dd>
                </div>
              ))}
          </dl>
        </div>
      )}
    </div>
  );
}

// Plan 2 Task 2.6.2 — simple ER view (default export). Used by /meta page.
// Domain group → fill color (5 ontology groups + time).
const GROUP_COLORS: Record<string, string> = {
  customer:            '#34d399', // emerald
  behavior:            '#60a5fa', // blue
  marketing:           '#f472b6', // pink
  operations:          '#fbbf24', // amber
  compliance_external: '#c084fc', // purple
  time:                '#9ca3af', // gray
};

export default function CytoscapeViewSimple({ elements }: { elements: any[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    let cy: any;
    (async () => {
      const cytoscape = (await import('cytoscape')).default;
      cy = cytoscape({
        container: ref.current,
        elements,
        // Dark-mode styling — text colors switched to light tokens so the
        // labels are readable against the bg-ink-950 container.
        style: [
          { selector: 'node', style: {
              'background-color': (n: any) => GROUP_COLORS[n.data('group')] ?? '#64748b',
              label: 'data(label)',
              'font-size': 11,
              color: '#e2e8f0',
              'text-valign': 'bottom',
              'text-margin-y': 4,
              'text-outline-color': '#0f172a',
              'text-outline-width': 2,
              width: 28,
              height: 28,
              'border-width': 1.5,
              'border-color': '#1e293b',
          } as any },
          { selector: 'edge', style: {
              width: 1,
              'line-color': '#475569',
              'curve-style': 'bezier',
              'target-arrow-shape': 'triangle',
              'target-arrow-color': '#475569',
              label: 'data(edge)',
              'font-size': 9,
              color: '#94a3b8',
              'text-rotation': 'autorotate',
              'text-outline-color': '#0f172a',
              'text-outline-width': 1.5,
          } as any },
        ],
        layout: { name: 'cose', animate: false },
      });
    })();
    return () => { cy?.destroy(); };
  }, [elements]);
  return <div ref={ref} className='w-full h-[600px] border border-ink-700 rounded-lg bg-ink-950' />;
}
