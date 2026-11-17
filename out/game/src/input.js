// Keyboard and mouse, and the pointer lock that turns the mouse into look. Plain browser
// APIs only: the game asks the canvas for pointer lock and reads movementX/Y while it holds it.
//
// Two different questions get asked of the keyboard: "is this held down" (movement) and "was
// this tapped" (buy keys, reload, weapon switch). A browser fires keydown and keyup possibly
// inside the same frame, so a held-key Set alone silently swallows quick taps. Every keydown is
// therefore also queued, and the simulation drains that queue once per fixed step.
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const queued = new Set();
  const state = { keys, locked: false, firing: false, lookX: 0, lookY: 0 };

  function setKey(event, down) {
    if (down) {
      if (!keys.has(event.code)) queued.add(event.code);
      keys.add(event.code);
    } else {
      keys.delete(event.code);
    }
    if (event.code === 'Space') event.preventDefault();
  }

  window.addEventListener('keydown', (event) => setKey(event, true));
  window.addEventListener('keyup', (event) => setKey(event, false));
  window.addEventListener('blur', () => { keys.clear(); queued.clear(); });
  window.addEventListener('mousemove', (event) => {
    if (!state.locked) return;
    state.lookX += event.movementX;
    state.lookY += event.movementY;
  });
  window.addEventListener('mousedown', (event) => {
    if (state.locked && event.button === 0) state.firing = true;
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) state.firing = false;
  });
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) {
      keys.clear();
      queued.clear();
      state.firing = false;
    }
    onLockChange(state.locked);
  });

  return {
    state,
    requestLock() {
      canvas.requestPointerLock();
    },
    takeLook() {
      const x = state.lookX;
      const y = state.lookY;
      state.lookX = 0;
      state.lookY = 0;
      return { x, y };
    },
    // Everything tapped since the last call. Cleared on read so one press is one action.
    takePressed() {
      const pressed = new Set(queued);
      queued.clear();
      return pressed;
    },
  };
}
