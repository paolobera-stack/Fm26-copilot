import React from 'react';
import { Player } from '../types';
import { RoleComparisonDefinition, getPlayerAttribute } from '../utils/playerRoleComparisonUtils';

interface PlayerSpiderRadarChartProps {
  playerA: Player;
  playerB: Player;
  role: RoleComparisonDefinition;
  hoveredAttrKey: string | null;
  onHoverAttr: (key: string | null) => void;
}

export const PlayerSpiderRadarChart: React.FC<PlayerSpiderRadarChartProps> = ({
  playerA,
  playerB,
  role,
  hoveredAttrKey,
  onHoverAttr,
}) => {
  const size = 440;
  const cx = size / 2;
  const cy = size / 2;
  const R = 145; // Max radius for attribute value 20

  const attributes = role.attributes;
  const N = attributes.length;

  if (N < 3) return null;

  // 5 concentric grid levels corresponding to 4, 8, 12, 16, 20 in FM scale
  const levels = [
    { value: 4, r: R * 0.2 },
    { value: 8, r: R * 0.4 },
    { value: 12, r: R * 0.6 },
    { value: 16, r: R * 0.8 },
    { value: 20, r: R * 1.0 },
  ];

  // Helper to get coordinates for an angle and radius
  const getCoordinates = (index: number, radius: number) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / N;
    return {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
      angle
    };
  };

  // Generate grid polygon paths
  const gridPolygons = levels.map(level => {
    const points = attributes.map((_, i) => {
      const { x, y } = getCoordinates(i, level.r);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return {
      points: points.join(' '),
      value: level.value,
      isTop: level.value === 16 || level.value === 20
    };
  });

  // Calculate coordinates for Player A
  const pointsA = attributes.map((attr, i) => {
    const val = getPlayerAttribute(playerA, attr.key);
    const clampedVal = Math.max(1, Math.min(20, val));
    const r = (clampedVal / 20) * R;
    const { x, y } = getCoordinates(i, r);
    return { x, y, val, attr, index: i };
  });

  const pathA = pointsA.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') + ' Z';

  // Calculate coordinates for Player B
  const pointsB = attributes.map((attr, i) => {
    const val = getPlayerAttribute(playerB, attr.key);
    const clampedVal = Math.max(1, Math.min(20, val));
    const r = (clampedVal / 20) * R;
    const { x, y } = getCoordinates(i, r);
    return { x, y, val, attr, index: i };
  });

  const pathB = pointsB.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') + ' Z';

  return (
    <div className="relative flex flex-col items-center justify-center select-none">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="w-full max-w-[420px] aspect-square overflow-visible drop-shadow-2xl"
      >
        <defs>
          {/* Gradients for fills */}
          <radialGradient id="radarCenterGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#0f172a" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#020617" stopOpacity="0.95" />
          </radialGradient>

          <linearGradient id="gradPlayerA" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#059669" stopOpacity="0.20" />
          </linearGradient>

          <linearGradient id="gradPlayerB" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#d97706" stopOpacity="0.20" />
          </linearGradient>

          {/* Glow filters for vertices */}
          <filter id="glowEmerald" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor="#10b981" floodOpacity="0.6" />
          </filter>
          <filter id="glowAmber" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor="#f59e0b" floodOpacity="0.6" />
          </filter>
        </defs>

        {/* Outer Background Circle */}
        <circle cx={cx} cy={cy} r={R + 4} fill="url(#radarCenterGlow)" />

        {/* Concentric Grid Polygons */}
        {gridPolygons.map((g, idx) => (
          <g key={idx}>
            <polygon
              points={g.points}
              fill="none"
              stroke={g.isTop ? 'rgba(56, 189, 248, 0.25)' : 'rgba(148, 163, 184, 0.12)'}
              strokeWidth={g.isTop ? '1.5' : '1'}
              strokeDasharray={g.value === 16 ? '3 3' : undefined}
            />
            {/* Scale numbers (placed on top vertical axis) */}
            <text
              x={cx + 4}
              y={cy - levels[idx].r + 3}
              fill="#64748b"
              fontSize="9"
              fontFamily="monospace"
              fontWeight="bold"
            >
              {g.value}
            </text>
          </g>
        ))}

        {/* Radial Spokes / Axes radiating from center */}
        {attributes.map((attr, i) => {
          const { x, y } = getCoordinates(i, R);
          const isHovered = hoveredAttrKey === attr.key;

          return (
            <line
              key={attr.key}
              x1={cx}
              y1={cy}
              x2={x}
              y2={y}
              stroke={isHovered ? 'rgba(56, 189, 248, 0.6)' : 'rgba(148, 163, 184, 0.18)'}
              strokeWidth={isHovered ? '2' : '1'}
              strokeDasharray={isHovered ? 'none' : '2 2'}
              className="transition-colors"
            />
          );
        })}

        {/* OVERLAY POLYGON: Player A (Emerald) */}
        <path
          d={pathA}
          fill="url(#gradPlayerA)"
          stroke="#10b981"
          strokeWidth="2.7"
          strokeLinejoin="round"
          className="transition-all duration-300"
        />

        {/* OVERLAY POLYGON: Player B (Amber) */}
        <path
          d={pathB}
          fill="url(#gradPlayerB)"
          stroke="#f59e0b"
          strokeWidth="2.7"
          strokeLinejoin="round"
          className="transition-all duration-300"
        />

        {/* Vertex Nodes: Player A (Emerald dots) */}
        {pointsA.map((p) => {
          const isHovered = hoveredAttrKey === p.attr.key;
          return (
            <g key={`pt_a_${p.attr.key}`} className="cursor-pointer" onMouseEnter={() => onHoverAttr(p.attr.key)} onMouseLeave={() => onHoverAttr(null)}>
              <circle
                cx={p.x}
                cy={p.y}
                r={isHovered ? 6 : 4}
                fill="#34d399"
                stroke="#064e3b"
                strokeWidth={isHovered ? 2.5 : 1.5}
                filter="url(#glowEmerald)"
                className="transition-all"
              />
            </g>
          );
        })}

        {/* Vertex Nodes: Player B (Amber dots) */}
        {pointsB.map((p) => {
          const isHovered = hoveredAttrKey === p.attr.key;
          return (
            <g key={`pt_b_${p.attr.key}`} className="cursor-pointer" onMouseEnter={() => onHoverAttr(p.attr.key)} onMouseLeave={() => onHoverAttr(null)}>
              <circle
                cx={p.x}
                cy={p.y}
                r={isHovered ? 6 : 4}
                fill="#fbbf24"
                stroke="#78350f"
                strokeWidth={isHovered ? 2.5 : 1.5}
                filter="url(#glowAmber)"
                className="transition-all"
              />
            </g>
          );
        })}

        {/* Center Pivot Point */}
        <circle cx={cx} cy={cy} r="3" fill="#38bdf8" opacity="0.6" />

        {/* Outer Perimeter Attribute Labels & Values */}
        {attributes.map((attr, i) => {
          const labelDist = R + 26;
          const { x, y, angle } = getCoordinates(i, labelDist);
          const valA = getPlayerAttribute(playerA, attr.key);
          const valB = getPlayerAttribute(playerB, attr.key);
          const isHovered = hoveredAttrKey === attr.key;

          // Text alignment based on horizontal position
          let textAnchor = 'middle';
          if (Math.cos(angle) > 0.3) textAnchor = 'start';
          else if (Math.cos(angle) < -0.3) textAnchor = 'end';

          return (
            <g
              key={`label_${attr.key}`}
              className="cursor-pointer transition-all"
              onMouseEnter={() => onHoverAttr(attr.key)}
              onMouseLeave={() => onHoverAttr(null)}
            >
              <text
                x={x}
                y={y}
                textAnchor={textAnchor}
                fontSize={isHovered ? '11.5' : '10.5'}
                fontWeight={attr.weight > 1.2 ? 'bold' : '600'}
                fill={isHovered ? '#38bdf8' : attr.weight > 1.2 ? '#e2e8f0' : '#94a3b8'}
                className="transition-colors font-sans"
              >
                {attr.weight > 1.2 ? '⭐ ' : ''}{attr.label}
              </text>
              <text
                x={x}
                y={y + 12}
                textAnchor={textAnchor}
                fontSize="9.5"
                fontFamily="monospace"
                fontWeight="bold"
              >
                <tspan fill="#34d399">{valA}</tspan>
                <tspan fill="#64748b"> vs </tspan>
                <tspan fill="#fbbf24">{valB}</tspan>
              </text>
            </g>
          );
        })}
      </svg>

      {/* Spider Legend Bar */}
      <div className="flex items-center justify-center gap-6 mt-2 pt-2 border-t border-slate-800/80 w-full text-xs">
        <div className="flex items-center gap-2">
          <span className="w-3.5 h-3.5 rounded-md bg-emerald-500/30 border-2 border-emerald-500 inline-block"></span>
          <span className="font-bold text-white truncate max-w-[130px] sm:max-w-[180px]">
            {playerA.name}
          </span>
        </div>
        <div className="text-slate-500 font-bold text-[10px] uppercase">Overlay FM26</div>
        <div className="flex items-center gap-2">
          <span className="w-3.5 h-3.5 rounded-md bg-amber-500/30 border-2 border-amber-500 inline-block"></span>
          <span className="font-bold text-white truncate max-w-[130px] sm:max-w-[180px]">
            {playerB.name}
          </span>
        </div>
      </div>
    </div>
  );
};
