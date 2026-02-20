/**
 * TypeScript declarations for the tracking_input native addon.
 */

export interface Mouse {
  create(): boolean
  move(dx: number, dy: number): void
  click(button?: 'left' | 'right' | 'middle'): void
  scroll(amount: number): void
  destroy(): void
}

export interface Keyboard {
  create(): boolean
  pressKey(key: string): void
  keyCombo(keys: string[]): void
  destroy(): void
}

export declare const mouse: Mouse
export declare const keyboard: Keyboard
