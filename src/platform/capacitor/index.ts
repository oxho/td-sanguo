/**
 * Empty Capacitor adapter. V0.1 ships the web platform only.
 * Do not call into a native bridge from here.
 */
export interface NativeShell {
  readonly ready: false;
}

export function nativeShell(): NativeShell {
  return { ready: false };
}
