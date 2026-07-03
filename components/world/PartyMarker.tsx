'use client';

interface PartyMarkerProps {
  x: number;
  y: number;
}

/** Pulsing double-circle marking the party's current map position. */
export function PartyMarker({ x, y }: PartyMarkerProps) {
  return (
    <g
      data-party-marker="true"
      transform={`translate(${x} ${y})`}
      className="pointer-events-none text-primary"
    >
      <circle r={14} fill="none" stroke="currentColor" strokeWidth={2} opacity={0.7}>
        <animate attributeName="r" values="14;26" dur="1.8s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.7;0" dur="1.8s" repeatCount="indefinite" />
      </circle>
      <circle r={14} fill="none" stroke="currentColor" strokeWidth={1.5} opacity={0.45} />
      <circle r={4} fill="currentColor" />
    </g>
  );
}
