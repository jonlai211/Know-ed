"use client";

import { useState, useMemo } from "react";
import { KgData, KgNode, KgEdge } from "@/types";

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const R = 18;
const COL_X: Record<number, number> = { 1: 75, 2: 160, 3: 245 };
const ROW_Y = (row: number) => 55 + (row - 1) * 80;

// Chapter colors by index (up to 5 chapters)
const CHAPTER_COLORS = ["#0284c7", "#059669", "#7c3aed", "#c2410c", "#006a6a"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function norm(dx: number, dy: number): [number, number] {
  const len = Math.hypot(dx, dy);
  if (len === 0) return [0, 0];
  return [dx / len, dy / len];
}

function f(n: number): string {
  return n.toFixed(2);
}

interface ComputedEdge {
  d: string;
  midX: number;
  midY: number;
}

function computeStraightPath(
  from: { x: number; y: number },
  to: { x: number; y: number }
): ComputedEdge {
  const [nx, ny] = norm(to.x - from.x, to.y - from.y);
  const sx = from.x + R * nx;
  const sy = from.y + R * ny;
  const ex = to.x - R * nx;
  const ey = to.y - R * ny;
  // Add slight quadratic curve if nodes are in the same or adjacent columns
  const dx = Math.abs(to.x - from.x);
  if (dx < 100) {
    // Use a gentle curve to avoid overlapping labels
    const cpx = (from.x + to.x) / 2 + (from.x < to.x ? -25 : 25);
    const cpy = (from.y + to.y) / 2;
    const [snx, sny] = norm(cpx - from.x, cpy - from.y);
    const [enx, eny] = norm(to.x - cpx, to.y - cpy);
    return {
      d: `M ${f(from.x + R * snx)} ${f(from.y + R * sny)} Q ${f(cpx)} ${f(cpy)} ${f(to.x - R * enx)} ${f(to.y - R * eny)}`,
      midX: 0.25 * from.x + 0.5 * cpx + 0.25 * to.x,
      midY: 0.25 * from.y + 0.5 * cpy + 0.25 * to.y,
    };
  }
  return {
    d: `M ${f(sx)} ${f(sy)} L ${f(ex)} ${f(ey)}`,
    midX: (sx + ex) / 2,
    midY: (sy + ey) / 2,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DynamicKnowledgeGraph({
  kgData,
  activeTermKey,
}: {
  kgData: KgData;
  activeTermKey?: string;
}) {
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  // Derive chapter list + color map from nodes
  const { chapterColors, nodeMap, edgePaths, viewBoxHeight } = useMemo(() => {
    const chapterOrder: string[] = [];
    for (const n of kgData.nodes) {
      if (!chapterOrder.includes(n.chapter)) chapterOrder.push(n.chapter);
    }
    const chapterColors: Record<string, string> = {};
    chapterOrder.forEach((ch, i) => {
      chapterColors[ch] = CHAPTER_COLORS[i % CHAPTER_COLORS.length];
    });

    const nodeMap = new Map<string, KgNode & { x: number; y: number; color: string }>();
    let maxY = 0;
    for (const n of kgData.nodes) {
      const x = COL_X[n.col] ?? 160;
      const y = ROW_Y(n.row);
      const color = chapterColors[n.chapter] ?? "#006a6a";
      nodeMap.set(n.id, { ...n, x, y, color });
      if (y > maxY) maxY = y;
    }

    const edgePaths = new Map<string, ComputedEdge>();
    for (const e of kgData.edges) {
      const from = nodeMap.get(e.from);
      const to = nodeMap.get(e.to);
      if (from && to) {
        edgePaths.set(e.id, computeStraightPath(from, to));
      }
    }

    // viewBox height: enough for nodes + labels + bottom margin
    const viewBoxHeight = Math.max(300, maxY + R + 40);

    return { chapterColors, nodeMap, edgePaths, viewBoxHeight };
  }, [kgData]);

  // Filtering by active term
  const primaryNodes = activeTermKey
    ? (kgData.term_nodes[activeTermKey] ?? [])
    : [];
  const isFiltered = primaryNodes.length > 0;
  const activeSet = useMemo(() => {
    if (!isFiltered) return null;
    const s = new Set(primaryNodes);
    for (const e of kgData.edges) {
      if (primaryNodes.includes(e.from)) s.add(e.to);
      if (primaryNodes.includes(e.to)) s.add(e.from);
    }
    return s;
  }, [isFiltered, primaryNodes, kgData.edges]);

  const chapters = Object.entries(chapterColors);

  if (kgData.nodes.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-on-surface-variant/40 text-sm">
        No graph data
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col items-center">
      <div className="w-full overflow-y-auto">
        <svg
          width="100%"
          viewBox={`0 0 320 ${viewBoxHeight}`}
          xmlns="http://www.w3.org/2000/svg"
          style={{ display: "block", fontFamily: "inherit" }}
        >
          <defs>
            <marker
              id="dkg-arr"
              markerUnits="userSpaceOnUse"
              markerWidth="7"
              markerHeight="7"
              refX="7"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0,0.5 7,3.5 0,6.5" fill="rgba(0,0,0,0.22)" />
            </marker>
            <marker
              id="dkg-arr-h"
              markerUnits="userSpaceOnUse"
              markerWidth="7"
              markerHeight="7"
              refX="7"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0,0.5 7,3.5 0,6.5" fill="#006a6a" />
            </marker>
          </defs>

          {/* Edges */}
          {kgData.edges.map((edge) => {
            const path = edgePaths.get(edge.id);
            if (!path) return null;
            const { d, midX, midY } = path;
            const hovered = hoveredEdge === edge.id;

            const edgeActive =
              !isFiltered ||
              (activeSet!.has(edge.from) && activeSet!.has(edge.to));
            const edgePrimary =
              isFiltered &&
              edgeActive &&
              (primaryNodes.includes(edge.from) ||
                primaryNodes.includes(edge.to));

            const stroke = hovered || edgePrimary ? "#006a6a" : "rgba(0,0,0,0.11)";
            const strokeWidth = hovered || edgePrimary ? 1.5 : 1;
            const marker =
              hovered || edgePrimary ? "url(#dkg-arr-h)" : "url(#dkg-arr)";

            const pillW = edge.label.length * 6.2 + 18;
            const pillH = 14;
            const rawPillX = midX - pillW / 2;
            const pillX = Math.max(2, Math.min(320 - pillW - 2, rawPillX));
            const pillY = midY - pillH / 2;

            return (
              <g key={edge.id} style={{ opacity: edgeActive ? 1 : 0.25 }}>
                <path
                  d={d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={14}
                  style={{ cursor: edgeActive ? "pointer" : "default" }}
                  onMouseEnter={() => edgeActive && setHoveredEdge(edge.id)}
                  onMouseLeave={() => setHoveredEdge(null)}
                />
                <path
                  d={d}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                  markerEnd={marker}
                  style={{
                    pointerEvents: "none",
                    transition: "stroke 0.2s, stroke-width 0.2s, opacity 0.3s",
                  }}
                />
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

          {/* Nodes */}
          {kgData.nodes.map((node) => {
            const n = nodeMap.get(node.id);
            if (!n) return null;
            const hovered = hoveredNode === node.id;
            const isPrimary = primaryNodes.includes(node.id);
            const isActive = !isFiltered || activeSet!.has(node.id);

            const fillOpacity = !isActive
              ? 0.04
              : isPrimary
              ? hovered ? 0.25 : 0.18
              : hovered ? 0.18 : 0.10;
            const strokeWidth = !isActive
              ? 1
              : isPrimary
              ? 2.5
              : hovered ? 2 : 1.5;
            const opacity = !isActive ? 0.22 : 1;

            const showTooltip = hovered && n.fullLabel !== n.display;
            const ttW = n.fullLabel.length * 5.8 + 16;
            const ttH = 14;
            const rawTtX = n.x - ttW / 2;
            const ttX = Math.max(2, Math.min(320 - ttW - 2, rawTtX));
            const ttY = n.y - R - ttH - 5;

            // Truncate display label that's too long
            const displayText =
              n.display.length > 10
                ? n.display.slice(0, 9) + "…"
                : n.display;

            return (
              <g
                key={node.id}
                style={{ opacity, transition: "opacity 0.3s" }}
                onMouseEnter={() => isActive && setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
              >
                {isPrimary && (
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={R + 5}
                    fill="none"
                    stroke={n.color}
                    strokeWidth={1}
                    opacity={0.35}
                  />
                )}
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={R}
                  fill={n.color}
                  fillOpacity={fillOpacity}
                  stroke={n.color}
                  strokeWidth={strokeWidth}
                  style={{ transition: "fill-opacity 0.2s, stroke-width 0.2s" }}
                />
                <text
                  x={n.x}
                  y={n.y + R + 10}
                  textAnchor="middle"
                  fontSize={9.5}
                  fontWeight={600}
                  fill={n.color}
                >
                  {displayText}
                </text>
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
                      stroke={n.color}
                      strokeWidth={1}
                      filter="drop-shadow(0 1px 3px rgba(0,0,0,0.12))"
                    />
                    <text
                      x={ttX + ttW / 2}
                      y={ttY + ttH / 2 + 3}
                      textAnchor="middle"
                      fontSize={8}
                      fontWeight={600}
                      fill={n.color}
                    >
                      {n.fullLabel}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend */}
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
        {chapters.map(([name, color]) => (
          <div
            key={name}
            style={{ display: "flex", alignItems: "center", gap: 5 }}
          >
            <span
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                borderRadius: "50%",
                backgroundColor: color,
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: 9,
                fontWeight: 500,
                color,
                whiteSpace: "nowrap",
              }}
            >
              {name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
