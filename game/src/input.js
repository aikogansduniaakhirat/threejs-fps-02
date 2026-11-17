// Keyboard and pointer lock, edge-triggered. Two things matter here and both are easy to get
// wrong: a tap that starts and ends between two frames must still register, and the mouse only
// turns the view while the canvas actually holds the pointer.

export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const queued = [];          // taps seen since the last frame, in order
  const state = {
    keys,
    lookX: 0,
    lookY: 0,
    firing: false,
    locked: false,
  };

  function down(event) {
    // The browser's own shortcuts would otherwise eat Tab and the arrows.
    if (event.code === 'Tab' || event.code.startsWith('Arrow')) event.preventDefault();
    if (event.repeat) return;
    if (!keys.has(event.code)) queued.push(event.code);
    keys.add(event.code);
  }

  function up(event) {
    keys.delete(event.code);
  }

  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  // A window that loses focus never sends the keyup, so a held key would stay held forever.
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0) state.firing = true;
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) state.firing = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  window.addEventListener('mousemove', (event) => {
    if (!state.locked) return;
    state.lookX += event.movementX;
    state.lookY += event.movementY;
  });

  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) {
      state.firing = false;
      keys.clear();
    }
    if (onLockChange) onLockChange(state.locked);
  });

  return {
    state,
    // Every key pressed since the last call, then the queue is cleared: a tap cannot be missed.
    takePressed() {
      const out = queued.slice();
      queued.length = 0;
      return out;
    },
    // Mouse delta since the last call, in pixels, then zeroed.
    takeLook() {
      const out = { x: state.lookX, y: state.lookY };
      state.lookX = 0;
      state.lookY = 0;
      return out;
    },
    request() {
      const asked = canvas.requestPointerLock();
      // Chrome returns a promise here and rejects it when the gesture was not trusted; the
      // rejection is expected during a capture run and says nothing useful.
      if (asked && typeof asked.catch === 'function') asked.catch(() => {});
    },
    release() {
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    },
  };
}
