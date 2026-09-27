/** Returns whether a key event originated in a text-entry control. */
export function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(
    'input, textarea, select, [role="textbox"], [contenteditable]:not([contenteditable="false"]), [data-no-global-shortcuts]',
  ));
}
