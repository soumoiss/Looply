const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export function createGalleryGestureController({ getBounds, minScale = 1, maxScale = 5 } = {}) {
  if (typeof getBounds !== "function") throw new TypeError("getBounds is required");
  const pointers = new Map();
  const state = { scale: minScale, x: 0, y: 0, mode: "idle" };
  let pinch = null;
  let pan = null;
  let swipe = null;

  const clamp = () => {
    const bounds = getBounds() || {};
    const maxX = Math.max(0, ((Number(bounds.mediaWidth) || 0) * state.scale - (Number(bounds.stageWidth) || 0)) / 2);
    const maxY = Math.max(0, ((Number(bounds.mediaHeight) || 0) * state.scale - (Number(bounds.stageHeight) || 0)) / 2);
    state.x = Math.max(-maxX, Math.min(maxX, state.x));
    state.y = Math.max(-maxY, Math.min(maxY, state.y));
  };

  const beginPointer = (id, x, y) => {
    delete state.swipeX;
    delete state.swipeY;
    pointers.set(id, { x, y });
    if (pointers.size >= 2) {
      const [first, second] = [...pointers.values()].slice(0, 2);
      const center = midpoint(first, second);
      pinch = {
        distance: Math.max(1, distance(first, second)),
        center,
        scale: state.scale,
        x: state.x,
        y: state.y
      };
      pan = null;
      swipe = null;
      state.mode = "pinch";
      return state.mode;
    }
    if (pointers.size === 1) {
      pan = { x, y, panX: state.x, panY: state.y };
      swipe = { x, y };
      state.mode = state.scale > minScale ? "pan" : "swipe";
    }
    return state.mode;
  };

  const movePointer = (id, x, y) => {
    if (!pointers.has(id)) return state;
    pointers.set(id, { x, y });
    if (pointers.size >= 2 && pinch) {
      const [first, second] = [...pointers.values()].slice(0, 2);
      const center = midpoint(first, second);
      const nextScale = Math.max(minScale, Math.min(maxScale, pinch.scale * distance(first, second) / pinch.distance));
      const ratio = nextScale / pinch.scale;
      state.scale = nextScale;
      // Re-anchor around the stage midpoint; callers pass pointer coordinates in stage space.
      state.x = pinch.x * ratio + (center.x - pinch.center.x);
      state.y = pinch.y * ratio + (center.y - pinch.center.y);
      state.mode = "pinch";
      clamp();
      return state;
    }
    if (pointers.size === 1 && pan) {
      if (state.scale > minScale) {
        state.mode = "pan";
        state.x = pan.panX + x - pan.x;
        state.y = pan.panY + y - pan.y;
        clamp();
      } else {
        state.mode = "swipe";
      }
    }
    return state;
  };

  const endPointer = id => {
    const point = pointers.get(id);
    pointers.delete(id);
    if (pointers.size >= 2) return state;
    pinch = null;
    if (pointers.size === 1) {
      const [remaining] = pointers.values();
      pan = { x: remaining.x, y: remaining.y, panX: state.x, panY: state.y };
      swipe = null;
      state.mode = state.scale > minScale ? "pan" : "swipe";
    } else {
      pan = null;
      if (point && swipe && state.scale <= minScale) {
        state.swipeX = point.x - swipe.x;
        state.swipeY = point.y - swipe.y;
      }
      swipe = null;
      state.mode = "idle";
    }
    return state;
  };

  const reset = () => {
    pointers.clear();
    pinch = null;
    pan = null;
    swipe = null;
    state.scale = minScale;
    state.x = 0;
    state.y = 0;
    state.mode = "idle";
    delete state.swipeX;
    delete state.swipeY;
  };

  const setScale = (next, focalX = 0, focalY = 0) => {
    const previous = state.scale;
    state.scale = Math.max(minScale, Math.min(maxScale, next));
    if (state.scale <= minScale) {
      state.x = 0;
      state.y = 0;
    } else if (previous > 0) {
      state.x = focalX - (focalX - state.x) * (state.scale / previous);
      state.y = focalY - (focalY - state.y) * (state.scale / previous);
    }
    clamp();
    return state;
  };

  return {
    beginPointer,
    movePointer,
    endPointer,
    setScale,
    reset,
    getState: () => ({ ...state }),
    getTransform: () => ({ x: state.x, y: state.y, scale: state.scale })
  };
}
