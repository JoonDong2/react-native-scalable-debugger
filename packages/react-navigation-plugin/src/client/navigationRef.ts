export interface NavigationRefLike {
  isReady?: () => boolean;
  getRootState?: () => unknown;
  getCurrentRoute?: () => unknown;
  navigate?: (...args: unknown[]) => void;
  goBack?: () => void;
  canGoBack?: () => boolean;
  dispatch?: (action: unknown) => void;
  resetRoot?: (state?: unknown) => void;
}

let navigationRef: NavigationRefLike | null = null;

export function registerNavigationRef(ref: NavigationRefLike): void {
  navigationRef = ref;
}

export function clearNavigationRef(ref?: NavigationRefLike): void {
  if (!ref || navigationRef === ref) {
    navigationRef = null;
  }
}

export function getNavigationRef(): NavigationRefLike | null {
  return navigationRef;
}

export function isNavigationReady(ref: NavigationRefLike): boolean {
  return typeof ref.isReady === 'function' ? ref.isReady() : true;
}
