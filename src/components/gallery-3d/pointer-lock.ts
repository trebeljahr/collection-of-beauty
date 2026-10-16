/** Asks for pointer lock and lets a refusal pass. Chrome refuses for
 *  about a second after the visitor left the lock with Esc, and then
 *  rejects the promise `requestPointerLock` returns. The document's
 *  `pointerlockerror` already reports it; uncaught, the rejection also
 *  surfaced as an unhandled one in the dev console. */
export function requestPointerLockQuietly(element: Element | null | undefined) {
  const result: unknown = element?.requestPointerLock?.();
  if (result instanceof Promise) result.catch(() => {});
}

/** A ref for drei's `<PointerLockControls>`: its click-to-lock calls the
 *  controls' `lock()` (three-stdlib's), which drops the promise. */
export function quietLock(controls: { lock: () => void; domElement?: HTMLElement } | null) {
  if (!controls) return;
  controls.lock = () => requestPointerLockQuietly(controls.domElement);
}
