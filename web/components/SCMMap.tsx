"use client";

// Palantir Foundry-style global SCM lane map.
// - Dark world canvas with subtle longitude graticule
// - 7-region glow markers, size proportional to lane fan-out
// - Bezier-curved lanes with regulation color coding + animated flow dashes
// - Dropped lanes (after reroute): muted dashed + opacity drop
// - Added lanes: emerald glow + thicker stroke + animated flow
// - Hover lane → tooltip with origin/dest/mode/days/regulations
// - Designed to be info-dense + tactical (small caps labels, monospace numerics)

import { useMemo, useState } from "react";
import { ComposableMap, Geographies, Geography, Marker, Graticule } from "react-simple-maps";
import type { TradeLane } from "@/lib/types";

const REGION_COORDS: Record<string, [number, number]> = {
  KR: [127.5, 36.5], CN: [104.1, 35.8], VN: [108.3, 14.0],
  MX: [-102.5, 23.6], PL: [19.1, 51.9], US: [-95.7, 37.0], IN: [78.9, 20.6],
};

const REGION_LABEL: Record<string, string> = {
  KR: "KR · 한국", CN: "CN · 중국", VN: "VN · 베트남",
  MX: "MX · 멕시코", PL: "PL · 폴란드", US: "US · 미국", IN: "IN · 인도",
};

const REG_COLOR: Record<string, string> = {
  "IRA-30D":      "#ef4444",
  "USMCA-Auto75": "#10b981",
  "CBAM":         "#f59e0b",
  default:        "#64748b",
};

const MODE_DASH: Record<string, string> = {
  SEA:  "0", AIR:  "4 4", RAIL: "10 4", ROAD: "2 3",
};

interface Highlights { dropped: string[]; added: string[]; }

interface Props {
  lanes: TradeLane[];
  highlights?: Highlights;
  modeFilter?: Set<string>;
  regFilter?:  Set<string>;
}

export function SCMMap({ lanes, highlights, modeFilter, regFilter }: Props) {
  const [hover, setHover] = useState<{ lane: TradeLane; x: number; y: number } | null>(null);

  const regionFanout = useMemo(() => {
    const m = new Map<string, number>();
    for (const ln of lanes) {
      m.set(ln.origin_region, (m.get(ln.origin_region) ?? 0) + 1);
      m.set(ln.dest_region,   (m.get(ln.dest_region)   ?? 0) + 1);
    }
    return m;
  }, [lanes]);

  const visibleLanes = useMemo(() => lanes.filter((l) => {
    if (modeFilter && modeFilter.size > 0 && !modeFilter.has(l.mode)) return false;
    if (regFilter && regFilter.size > 0) {
      const has = (l.regulations ?? []).some((r) => regFilter.has(r));
      const isPlain = (l.regulations ?? []).length === 0 && regFilter.has("PLAIN");
      if (!has && !isPlain) return false;
    }
    return true;
  }), [lanes, modeFilter, regFilter]);

  return (
    <div className="relative w-full h-full bg-ink-950 rounded-lg border border-ink-700 overflow-hidden">
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ scale: 145, center: [60, 30] }}
        width={900} height={520}
        style={{ width: "100%", height: "auto", display: "block" }}
      >
        <Graticule stroke="#1e293b" strokeWidth={0.4} />
        <Geographies geography="https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json">
          {({ geographies }) =>
            geographies.map((geo) => (
              <Geography
                key={geo.rsmKey}
                geography={geo}
                fill="#0f172a"
                stroke="#334155"
                strokeWidth={0.4}
                style={{
                  default: { outline: "none" },
                  hover:   { outline: "none", fill: "#1e293b" },
                  pressed: { outline: "none" },
                }}
              />
            ))
          }
        </Geographies>

        <LanesLayer
          lanes={visibleLanes}
          highlights={highlights}
          onHover={(lane, x, y) => setHover({ lane, x, y })}
          onLeave={() => setHover(null)}
        />

        {Object.entries(REGION_COORDS).map(([code, coords]) => {
          const fanout = regionFanout.get(code) ?? 0;
          const r = Math.max(5, Math.min(14, 4 + fanout * 0.4));
          return (
            <Marker key={code} coordinates={coords}>
              <circle r={r + 6} fill="#3b82f6" opacity={0.08} className="scm-pulse" />
              <circle r={r + 3} fill="#3b82f6" opacity={0.18} />
              <circle r={r}     fill="#1e3a8a" stroke="#60a5fa" strokeWidth={1.5} />
              <text x={r + 5} y={4}  fontSize={10} fill="#cbd5e1" fontWeight={600}
                style={{ fontFamily: "ui-monospace, monospace", pointerEvents: "none", userSelect: "none" }}>
                {REGION_LABEL[code] ?? code}
              </text>
              <text x={r + 5} y={16} fontSize={9}  fill="#64748b"
                style={{ fontFamily: "ui-monospace, monospace", pointerEvents: "none", userSelect: "none" }}>
                {fanout} lanes
              </text>
            </Marker>
          );
        })}
      </ComposableMap>

      {hover && (
        <div
          className="absolute pointer-events-none z-30 px-3 py-2 rounded-md border border-ink-600 bg-ink-900/95 backdrop-blur shadow-xl text-xs"
          style={{ left: hover.x + 12, top: hover.y + 12 }}
        >
          <div className="text-ink-100 font-mono font-bold">{hover.lane.id}</div>
          <div className="text-ink-300">
            {REGION_LABEL[hover.lane.origin_region] ?? hover.lane.origin_region}
            {" → "}
            {REGION_LABEL[hover.lane.dest_region] ?? hover.lane.dest_region}
          </div>
          <div className="flex gap-3 mt-1 text-[10px] font-mono">
            <span className="text-ink-400">{hover.lane.mode}</span>
            <span className="text-ink-400">{hover.lane.transit_days}일</span>
          </div>
          {(hover.lane.regulations ?? []).length > 0 && (
            <div className="flex gap-1 mt-1.5 flex-wrap">
              {(hover.lane.regulations ?? []).map((r) => (
                <span key={r} className="text-[9px] font-mono px-1.5 py-0.5 rounded border"
                  style={{
                    borderColor: REG_COLOR[r] ?? REG_COLOR.default,
                    color:       REG_COLOR[r] ?? REG_COLOR.default,
                    backgroundColor: (REG_COLOR[r] ?? REG_COLOR.default) + "1a",
                  }}>
                  {r}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="absolute bottom-3 right-3 bg-ink-900/90 border border-ink-700 rounded-md p-3 text-[10px] font-mono space-y-1.5 backdrop-blur z-20">
        <div className="text-ink-400 uppercase tracking-wider text-[9px] mb-1">Regulation</div>
        <Legend color="#ef4444" label="IRA-30D (CN→US 차단)" />
        <Legend color="#10b981" label="USMCA-Auto75 (MX→US)" />
        <Legend color="#f59e0b" label="CBAM (EU 수입)" />
        <Legend color="#64748b" label="규제 없음" />
        <div className="text-ink-400 uppercase tracking-wider text-[9px] mt-2 mb-1">Mode</div>
        <Legend dash="0"     label="SEA 해상" />
        <Legend dash="4 4"   label="AIR 항공" />
        <Legend dash="10 4"  label="RAIL 철도" />
        <Legend dash="2 3"   label="ROAD 육상" />
      </div>

      <style jsx global>{`
        .scm-pulse {
          animation: scm_pulse 2.4s cubic-bezier(0.4, 0, 0.6, 1) infinite;
          transform-origin: center;
          transform-box: fill-box;
        }
        @keyframes scm_pulse {
          0%, 100% { opacity: 0.04; transform: scale(0.9); }
          50%      { opacity: 0.18; transform: scale(1.1); }
        }
        @keyframes lane-flow {
          0%   { stroke-dashoffset: 0;   }
          100% { stroke-dashoffset: 40;  }
        }
      `}</style>
    </div>
  );
}


function LanesLayer({ lanes, highlights, onHover, onLeave }: {
  lanes: TradeLane[];
  highlights?: Highlights;
  onHover: (lane: TradeLane, x: number, y: number) => void;
  onLeave: () => void;
}) {
  const dropped = new Set(highlights?.dropped ?? []);
  const added   = new Set(highlights?.added   ?? []);
  return (
    <>
      {lanes.map((l) => {
        const o = REGION_COORDS[l.origin_region];
        const d = REGION_COORDS[l.dest_region];
        if (!o || !d) return null;
        const isDropped = dropped.has(l.id);
        const isAdded   = added.has(l.id);
        const isFlagged = (l.regulations ?? []).length > 0;
        const regKey = (l.regulations?.[0] ?? "default");
        const stroke = isAdded   ? "#10b981"
                     : isDropped ? "#ef4444"
                     : (REG_COLOR[regKey] ?? REG_COLOR.default);
        const dasharray = isDropped ? "3 3" : (MODE_DASH[l.mode] ?? "0");
        const opacity   = isDropped ? 0.45 : isAdded ? 1.0 : (isFlagged ? 0.85 : 0.55);
        const width     = isAdded ? 2.5 : isFlagged ? 1.6 : 1.0;
        return (
          <LaneArc
            key={l.id}
            origin={o} dest={d}
            stroke={stroke} dasharray={dasharray} opacity={opacity}
            strokeWidth={width} isAdded={isAdded}
            onHover={(x, y) => onHover(l, x, y)}
            onLeave={onLeave}
          />
        );
      })}
    </>
  );
}


function LaneArc({
  origin, dest, stroke, dasharray, opacity, strokeWidth, isAdded, onHover, onLeave,
}: {
  origin: [number, number]; dest: [number, number];
  stroke: string; dasharray: string; opacity: number; strokeWidth: number;
  isAdded: boolean;
  onHover: (x: number, y: number) => void; onLeave: () => void;
}) {
  // Mercator projection consistent with the ComposableMap config above
  const W = 900, H = 520, S = 145, CX_LON = 60, CY_LAT = 30;
  function project([lon, lat]: [number, number]): [number, number] {
    const k = (Math.PI / 180) * S;
    const x = W / 2 + k * (lon - CX_LON);
    const yMerc       = Math.log(Math.tan(Math.PI / 4 + (lat    * Math.PI) / 360));
    const yMercCenter = Math.log(Math.tan(Math.PI / 4 + (CY_LAT * Math.PI) / 360));
    const y = H / 2 - k * (yMerc - yMercCenter);
    return [x, y];
  }
  const [x1, y1] = project(origin);
  const [x2, y2] = project(dest);
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.max(1, Math.sqrt(dx * dx + dy * dy));
  const lift = Math.min(180, len * 0.30);
  const cx = mx + (-dy / len) * lift;
  const cy = my + ( dx / len) * lift - 30;
  const pathD = `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
  const arrowId = `arrow-${stroke.replace("#", "")}-${strokeWidth.toString().replace(".", "_")}`;

  return (
    <g style={{ cursor: "pointer" }}
       onMouseMove={(e) => onHover(e.clientX, e.clientY)}
       onMouseLeave={onLeave}>
      {isAdded && <path d={pathD} stroke="#10b981" strokeWidth={6} opacity={0.18} fill="none" />}
      <defs>
        <marker id={arrowId} viewBox="0 0 10 10" refX={8} refY={5} markerWidth={5} markerHeight={5} orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill={stroke} opacity={opacity} />
        </marker>
      </defs>
      <path
        d={pathD}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeDasharray={dasharray}
        opacity={opacity}
        fill="none"
        markerEnd={`url(#${arrowId})`}
      />
      {isAdded && (
        <path
          d={pathD}
          stroke="#10b981"
          strokeWidth={strokeWidth + 1.2}
          fill="none"
          opacity={0.5}
          style={{ strokeDasharray: "8 12", animation: "lane-flow 1.4s linear infinite" }}
        />
      )}
      <path d={pathD} stroke="transparent" strokeWidth={10} fill="none" />
    </g>
  );
}


function Legend({ color, dash, label }: { color?: string; dash?: string; label: string }) {
  return (
    <div className="flex items-center gap-2 text-ink-300">
      {color !== undefined && (
        <span className="inline-block w-4 h-1 rounded-sm" style={{ backgroundColor: color }} />
      )}
      {color === undefined && dash !== undefined && (
        <svg width="20" height="6" className="shrink-0">
          <line x1="0" y1="3" x2="20" y2="3" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray={dash} />
        </svg>
      )}
      <span>{label}</span>
    </div>
  );
}
