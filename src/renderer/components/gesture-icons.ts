/**
 * Simple SVG hand pose icons for the gesture guide.
 * Each icon is a 24x24 SVG string depicting the hand pose.
 */

const FALLBACK_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="1.5"><circle cx="12" cy="12" r="8"/></svg>'

export const GESTURE_ICON_MAP: Record<string, string> = {
  Pinch: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4a9eff" stroke-width="1.5"><path d="M12 4v6M8 14c0-2 1-3 4-3s4 1 4 3M10 7l2-3 2 3"/><circle cx="12" cy="10" r="1.5" fill="#4a9eff"/></svg>',
  Point: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4a9eff" stroke-width="1.5"><path d="M12 3v10M9 16c0-1.5 1-2.5 3-2.5s3 1 3 2.5v2c0 1-1 2-3 2s-3-1-3-2v-2"/></svg>',
  OpenPalm: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6bcb77" stroke-width="1.5"><path d="M6 10V6M9 10V4M12 10V3M15 10V4M18 10V6"/><rect x="5" y="10" width="14" height="10" rx="4"/></svg>',
  Fist: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#e05050" stroke-width="1.5"><rect x="6" y="6" width="12" height="14" rx="5"/><path d="M9 10h6M9 13h6"/></svg>',
  LShape: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f0c040" stroke-width="1.5"><path d="M8 20V8M8 8h8"/><circle cx="8" cy="6" r="1.5" fill="#f0c040"/><circle cx="18" cy="8" r="1.5" fill="#f0c040"/></svg>',
  FlatDrag: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4a9eff" stroke-width="1.5"><path d="M4 12h16M18 9l3 3-3 3"/><rect x="6" y="6" width="12" height="2" rx="1"/></svg>',
  Twist: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#c080ff" stroke-width="1.5"><path d="M12 4c-4 0-6 3-6 8s2 8 6 8"/><path d="M12 4c4 0 6 3 6 8s-2 8-6 8"/><path d="M8 9l-2 3 2 3M16 9l2 3-2 3"/></svg>'
}

/** Returns an SVG string icon for the given gesture name */
export function getGestureIcon(gesture: string): string {
  return GESTURE_ICON_MAP[gesture] ?? FALLBACK_ICON
}
