export type MapRoom = { left: number; right: number; top: number; bottom: number };

/** Place a direction cue on the usable map edge, in screen coordinates clockwise from up. */
export function mapCue(label: string, angle: number, distance: number, room: MapRoom) {
  const arrow = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'][(Math.round((angle * 4) / Math.PI) + 8) % 8];
  const length = distance >= 1000 ? (distance / 1000).toFixed(distance < 10000 ? 1 : 0) + ' km' : Math.round(distance) + ' m';
  const text = arrow + ' ' + label + ' · ' + length;
  const cx = (room.left + room.right) / 2,
    cy = (room.top + room.bottom) / 2;
  const rx = Math.max(1, cx - room.left - text.length * 3.7 - 10);
  const ry = Math.max(1, cy - room.top - 16);
  const k = Math.min(rx / Math.max(0.0001, Math.abs(Math.sin(angle))), ry / Math.max(0.0001, Math.abs(Math.cos(angle))));
  return { x: cx + k * Math.sin(angle), y: cy - k * Math.cos(angle), text };
}
