"use client";

import { useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NodeDef {
  id: string;
  display: string;
  fullLabel: string;
  chapter: string;
  color: string;
  x: number;
  y: number;
}

interface EdgeDef {
  id: string;
  from: string;
  to: string;
  label: string;
  type: "straight" | "quadratic" | "cubic";
  cp?: [number, number];
  cp1?: [number, number];
  cp2?: [number, number];
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const R = 18;

const NODES: NodeDef[] = [
  { id: "diene",  display: "Diene",      fullLabel: "Diene",               chapter: "Components",      color: "#0284c7", x: 78,  y: 55  },
  { id: "dphile", display: "Dienophile", fullLabel: "Dienophile",          chapter: "Components",      color: "#0284c7", x: 246, y: 55  },
  { id: "scis",   display: "s-cis",      fullLabel: "s-cis Conformation",  chapter: "Geometry",        color: "#059669", x: 68,  y: 180 },
  { id: "peri",   display: "Pericyclic", fullLabel: "Pericyclic",          chapter: "Mechanism",       color: "#006a6a", x: 256, y: 180 },
  { id: "conc",   display: "Concerted",  fullLabel: "Concerted",           chapter: "Mechanism",       color: "#006a6a", x: 162, y: 292 },
  { id: "sspec",  display: "Stereospec.", fullLabel: "Stereospecificity",  chapter: "Stereochemistry", color: "#7c3aed", x: 72,  y: 390 },
  { id: "endo",   display: "Endo Rule",  fullLabel: "Endo Rule",           chapter: "Stereochemistry", color: "#7c3aed", x: 254, y: 390 },
  { id: "ortho",  display: "Ortho-Para", fullLabel: "Ortho-Para Rule",     chapter: "Regiochemistry",  color: "#c2410c", x: 162, y: 468 },
];

const EDGES: EdgeDef[] = [
  { id: "e-diene-dphile", from: "diene",  to: "dphile", label: "reacts with",  type: "straight" },
  { id: "e-diene-scis",   from: "diene",  to: "scis",   label: "must be",      type: "straight" },
  { id: "e-scis-conc",    from: "scis",   to: "conc",   label: "enables",      type: "quadratic", cp:  [95, 240] },
  { id: "e-peri-conc",    from: "peri",   to: "conc",   label: "explains",     type: "quadratic", cp:  [228, 240] },
  { id: "e-conc-sspec",   from: "conc",   to: "sspec",  label: "leads to",     type: "quadratic", cp:  [100, 342] },
  { id: "e-conc-endo",    from: "conc",   to: "endo",   label: "enables",      type: "quadratic", cp:  [228, 342] },
  { id: "e-peri-endo",    from: "peri",   to: "endo",   label: "influences",   type: "quadratic", cp:  [290, 290] },
  { id: "e-sspec-endo",   from: "sspec",  to: "endo",   label: "supports",     type: "straight" },
  { id: "e-diene-ortho",  from: "diene",  to: "ortho",  label: "influences",   type: "cubic", cp1: [-12, 280], cp2: [100, 490] },
  { id: "e-dphile-ortho", from: "dphile", to: "ortho",  label: "influences",   type: "cubic", cp1: [336, 280], cp2: [225, 490] },
];

const CHAPTERS = [
  { name: "Components",      color: "#0284c7" },
  { name: "Geometry",        color: "#059669" },
  { name: "Mechanism",       color: "#006a6a" },
  { name: "Stereochemistry", color: "#7c3aed" },
  { name: "Regiochemistry",  color: "#c2410c" },
];

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------

function norm(dx: number, dy: number): [number, number] {
  const len = Math.hypot(dx, dy);
  if (len === 0) return [0, 0];
  return [dx / len, dy / len];
}

function computeEdgePath(edge: EdgeDef, nodes: Map<string, NodeDef>): {
  d: string;
  midX: number;
  midY: number;
} {
  const from = nodes.get(edge.from)!;
  const to   = nodes.get(edge.to)!;

  if (edge.type === "straight") {
    const [nx, ny] = norm(to.x - from.x, to.y - from.y);
    const sx = from.x + R * nx;
    const sy = from.y + R * ny;
    const ex = to.x   - R * nx;
    const ey = to.y   - R * ny;
    return {
      d: `M ${f(sx)} ${f(sy)} L ${f(ex)} ${f(ey)}`,
      midX: (sx + ex) / 2,
      midY: (sy + ey) / 2,
    };
  }

  if (edge.type === "quadratic") {
    const [cpx, cpy] = edge.cp!;
    // start: from_center + R * normalize(cp - from)
    const [snx, sny] = norm(cpx - from.x, cpy - from.y);
    const sx = from.x + R * snx;
    const sy = from.y + R * sny;
    // end: to_center - R * normalize(to - cp)
    const [enx, eny] = norm(to.x - cpx, to.y - cpy);
    const ex = to.x - R * enx;
    const ey = to.y - R * eny;
    // midpoint B(0.5) = 0.25*from + 0.5*cp + 0.25*to (using centers)
    const midX = 0.25 * from.x + 0.5 * cpx + 0.25 * to.x;
    const midY = 0.25 * from.y + 0.5 * cpy + 0.25 * to.y;
    return {
      d: `M ${f(sx)} ${f(sy)} Q ${f(cpx)} ${f(cpy)} ${f(ex)} ${f(ey)}`,
      midX,
      midY,
    };
  }

  // cubic
  const [cp1x, cp1y] = edge.cp1!;
  const [cp2x, cp2y] = edge.cp2!;
  // start
  const [snx, sny] = norm(cp1x - from.x, cp1y - from.y);
  const sx = from.x + R * snx;
  const sy = from.y + R * sny;
  // end
  const [enx, eny] = norm(to.x - cp2x, to.y - cp2y);
  const ex = to.x - R * enx;
  const ey = to.y - R * eny;
  // midpoint B(0.5) = 0.125*from + 0.375*cp1 + 0.375*cp2 + 0.125*to
  const midX = 0.125 * from.x + 0.375 * cp1x + 0.375 * cp2x + 0.125 * to.x;
  const midY = 0.125 * from.y + 0.375 * cp1y + 0.375 * cp2y + 0.125 * to.y;
  return {
    d: `M ${f(sx)} ${f(sy)} C ${f(cp1x)} ${f(cp1y)} ${f(cp2x)} ${f(cp2y)} ${f(ex)} ${f(ey)}`,
    midX,
    midY,
  };
}

function f(n: number): string {
  return n.toFixed(2);
}

// ---------------------------------------------------------------------------
// Precompute paths
// ---------------------------------------------------------------------------

const nodeMap = new Map<string, NodeDef>(NODES.map((n) => [n.id, n]));

const edgePaths = new Map(
  EDGES.map((e) => [e.id, computeEdgePath(e, nodeMap)])
);

// ---------------------------------------------------------------------------
// Term → primary KG node mapping  (chIdx-tIdx → node ids)
// ---------------------------------------------------------------------------

const TERM_PRIMARY_NODES: Record<string, string[]> = {
  "0-0": ["conc", "peri"],   // Fundamentals > Mechanism
  "0-1": ["diene", "dphile"], // Fundamentals > Components
  "0-2": ["scis"],            // Fundamentals > Geometry
  "1-0": ["sspec", "endo"],   // Outcomes > Stereochemistry
  "1-1": ["ortho"],           // Outcomes > Regiochemistry
}

function buildActiveSet(primaryIds: string[]): Set<string> {
  const s = new Set(primaryIds)
  for (const e of EDGES) {
    if (primaryIds.includes(e.from)) s.add(e.to)
    if (primaryIds.includes(e.to)) s.add(e.from)
  }
  return s
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DemoKnowledgeGraph({ activeTermKey }: { activeTermKey?: string }) {
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  const primaryNodes = activeTermKey ? (TERM_PRIMARY_NODES[activeTermKey] ?? []) : []
  const isFiltered = primaryNodes.length > 0
  const activeSet = isFiltered ? buildActiveSet(primaryNodes) : null

  return (
    <div className="w-full h-full flex flex-col items-center">
      {/* SVG graph */}
      <div className="w-full overflow-y-auto">
        <svg
          width="100%"
          viewBox="0 0 320 510"
          xmlns="http://www.w3.org/2000/svg"
          style={{ display: "block", fontFamily: "inherit" }}
        >
          <defs>
            {/* Gray arrowhead */}
            <marker
              id="kg-arr"
              markerUnits="userSpaceOnUse"
              markerWidth="7"
              markerHeight="7"
              refX="7"
              refY="3.5"
              orient="auto"
            >
              <polygon
                points="0,0.5 7,3.5 0,6.5"
                fill="rgba(0,0,0,0.22)"
              />
            </marker>
            {/* Teal arrowhead */}
            <marker
              id="kg-arr-h"
              markerUnits="userSpaceOnUse"
              markerWidth="7"
              markerHeight="7"
              refX="7"
              refY="3.5"
              orient="auto"
            >
              <polygon
                points="0,0.5 7,3.5 0,6.5"
                fill="#006a6a"
              />
            </marker>
          </defs>

          {/* ----------------------------------------------------------------
              Edges — render hit area + visual path for each edge
          ---------------------------------------------------------------- */}
          {EDGES.map((edge) => {
            const { d, midX, midY } = edgePaths.get(edge.id)!;
            const hovered = hoveredEdge === edge.id;

            // Filtering state
            const edgeActive = !isFiltered || (activeSet!.has(edge.from) && activeSet!.has(edge.to))
            const edgePrimary = isFiltered && (primaryNodes.includes(edge.from) || primaryNodes.includes(edge.to)) && edgeActive

            const edgeStroke = hovered
              ? "#006a6a"
              : edgePrimary
                ? "#006a6a"
                : edgeActive
                  ? "rgba(0,0,0,0.11)"
                  : "rgba(0,0,0,0.05)"
            const edgeStrokeWidth = hovered ? 1.5 : edgePrimary ? 1.5 : 1
            const edgeMarker = (hovered || edgePrimary) ? "url(#kg-arr-h)" : "url(#kg-arr)"

            // Label pill geometry
            const pillW = edge.label.length * 6.2 + 18;
            const pillH = 14;
            const rawPillX = midX - pillW / 2;
            // Clamp so pill stays inside viewBox (0..320)
            const pillX = Math.max(2, Math.min(320 - pillW - 2, rawPillX));
            const pillY = midY - pillH / 2;

            return (
              <g key={edge.id} style={{ opacity: edgeActive ? 1 : 0.25 }}>
                {/* Invisible wide hit area */}
                <path
                  d={d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={14}
                  style={{ cursor: edgeActive ? "pointer" : "default" }}
                  onMouseEnter={() => edgeActive && setHoveredEdge(edge.id)}
                  onMouseLeave={() => setHoveredEdge(null)}
                />
                {/* Visible path */}
                <path
                  d={d}
                  fill="none"
                  stroke={edgeStroke}
                  strokeWidth={edgeStrokeWidth}
                  markerEnd={edgeMarker}
                  style={{ pointerEvents: "none", transition: "stroke 0.2s, stroke-width 0.2s, opacity 0.3s" }}
                />
                {/* Label pill on hover */}
                {hovered && edgeActive && (
                  <g style={{ pointerEvents: "none" }}>
                    <rect
                      x={pillX}
                      y={pillY}
                      width={pillW}
                      height={pillH}
                      rx={7}
                      ry={7}
                      fill="white"
                      stroke="#006a6a"
                      strokeWidth={1}
                    />
                    <text
                      x={pillX + pillW / 2}
                      y={pillY + pillH / 2 + 3}
                      textAnchor="middle"
                      fontSize={8}
                      fontWeight={600}
                      fill="#006a6a"
                    >
                      {edge.label}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* ----------------------------------------------------------------
              Nodes
          ---------------------------------------------------------------- */}
          {NODES.map((node) => {
            const hovered = hoveredNode === node.id;
            const showTooltip = hovered && node.fullLabel !== node.display;
            const isSspec = node.id === "sspec";

            const isPrimary = primaryNodes.includes(node.id)
            const isActive = !isFiltered || activeSet!.has(node.id)

            // Visual states
            const nodeFillOpacity = !isActive ? 0.04 : isPrimary ? (hovered ? 0.25 : 0.18) : (hovered ? 0.18 : 0.10)
            const nodeStrokeWidth = !isActive ? 1 : isPrimary ? 2.5 : (hovered ? 2 : 1.5)
            const nodeOpacity = !isActive ? 0.22 : 1

            // Tooltip pill geometry
            const tooltipText = node.fullLabel;
            const ttW = tooltipText.length * 5.8 + 16;
            const ttH = 14;
            const rawTtX = node.x - ttW / 2;
            const ttX = Math.max(2, Math.min(320 - ttW - 2, rawTtX));
            const ttY = node.y - R - ttH - 5;

            return (
              <g
                key={node.id}
                style={{ cursor: isActive ? "default" : "default", opacity: nodeOpacity, transition: "opacity 0.3s" }}
                onMouseEnter={() => isActive && setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
              >
                {/* Primary node halo ring */}
                {isPrimary && (
                  <circle
                    cx={node.x} cy={node.y} r={R + 5}
                    fill="none"
                    stroke={node.color}
                    strokeWidth={1}
                    opacity={0.35}
                  />
                )}
                {/* Circle */}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={R}
                  fill={node.color}
                  fillOpacity={nodeFillOpacity}
                  stroke={node.color}
                  strokeWidth={nodeStrokeWidth}
                  style={{ transition: "fill-opacity 0.2s, stroke-width 0.2s" }}
                />

                {/* Node label — centered below circle */}
                {isSspec ? (
                  <>
                    <text
                      x={node.x}
                      y={node.y + R + 10}
                      textAnchor="middle"
                      fontSize={9.5}
                      fontWeight={600}
                      fill={node.color}
                    >
                      Stereo-
                    </text>
                    <text
                      x={node.x}
                      y={node.y + R + 10 + 12}
                      textAnchor="middle"
                      fontSize={9.5}
                      fontWeight={600}
                      fill={node.color}
                    >
                      specificity
                    </text>
                  </>
                ) : (
                  <text
                    x={node.x}
                    y={node.y + R + 10}
                    textAnchor="middle"
                    fontSize={9.5}
                    fontWeight={600}
                    fill={node.color}
                  >
                    {node.display}
                  </text>
                )}

                {/* Tooltip on hover (only when fullLabel differs from display) */}
                {showTooltip && (
                  <g style={{ pointerEvents: "none" }}>
                    <rect
                      x={ttX}
                      y={ttY}
                      width={ttW}
                      height={ttH}
                      rx={7}
                      ry={7}
                      fill="white"
                      stroke={node.color}
                      strokeWidth={1}
                      filter="drop-shadow(0 1px 3px rgba(0,0,0,0.12))"
                    />
                    <text
                      x={ttX + ttW / 2}
                      y={ttY + ttH / 2 + 3}
                      textAnchor="middle"
                      fontSize={8}
                      fontWeight={600}
                      fill={node.color}
                    >
                      {tooltipText}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* ----------------------------------------------------------------
          Legend (HTML, below SVG)
      ---------------------------------------------------------------- */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "6px 12px",
          padding: "8px 12px",
          width: "100%",
          justifyContent: "center",
        }}
      >
        {CHAPTERS.map((ch) => (
          <div
            key={ch.name}
            style={{ display: "flex", alignItems: "center", gap: 5 }}
          >
            <span
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                borderRadius: "50%",
                backgroundColor: ch.color,
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: 9,
                fontWeight: 500,
                color: ch.color,
                whiteSpace: "nowrap",
              }}
            >
              {ch.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
