// The whole look, in one place: eight values and two team tints. Every material in the game
// reads from here, and the same names are the CSS custom properties in index.html, so the HUD
// and the scene never drift apart.
export const PALETTE = {
  sky: '#2b303c',
  ground: '#3b352c',
  brick: '#8a4a34',
  brickDark: '#5a3126',
  kiln: '#a9693f',
  metal: '#6b645a',
  ink: '#f0ece4',
  muted: '#9aa0a8',
  ember: '#e0632a',
  glow: '#ffb066',
  ct: '#4f9ec4',
  t: '#e0632a',
};

export function color(name) {
  return PALETTE[name] ?? PALETTE.muted;
}
