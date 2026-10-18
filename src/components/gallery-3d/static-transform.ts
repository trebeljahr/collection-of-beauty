import type { Object3D } from "three";

/** Only for native scene nodes whose transforms React owns. R3F calls
 * onUpdate after applying changed props, so their local matrices stay current
 * without recomposing each frame. World-matrix updates remain enabled.
 * Imperative transform mutations must call updateMatrix() themselves. */
export const staticTransform = {
  matrixAutoUpdate: false,
  onUpdate(object: Object3D) {
    object.updateMatrix();
  },
} as const;
