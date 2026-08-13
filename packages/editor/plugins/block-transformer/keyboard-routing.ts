export type BlockTransformerNavigationKey =
  | "Escape"
  | "Enter"
  | "Tab"
  | "ArrowLeft"
  | "ArrowRight"
  | "ArrowUp"
  | "ArrowDown";

const EVENT_TAIL_TIMEOUT_MS = 750;

const KEY_ALIASES: Readonly<Record<string, BlockTransformerNavigationKey>> = {
  Esc: "Escape",
  Return: "Enter",
  Left: "ArrowLeft",
  Right: "ArrowRight",
  Up: "ArrowUp",
  Down: "ArrowDown",
  UIKeyInputLeftArrow: "ArrowLeft",
  UIKeyInputRightArrow: "ArrowRight",
  UIKeyInputUpArrow: "ArrowUp",
  UIKeyInputDownArrow: "ArrowDown",
};

const KEY_CODES: Readonly<Record<number, BlockTransformerNavigationKey>> = {
  9: "Tab",
  13: "Enter",
  27: "Escape",
  37: "ArrowLeft",
  38: "ArrowUp",
  39: "ArrowRight",
  40: "ArrowDown",
};

const NAVIGATION_KEYS = new Set<BlockTransformerNavigationKey>([
  "Escape",
  "Enter",
  "Tab",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
]);

/** Normalizes modern and legacy WebKit keyboard values without owning text input. */
export function normalizeBlockTransformerNavigationKey(
  key: string,
  keyCode = 0,
): BlockTransformerNavigationKey | null {
  if (NAVIGATION_KEYS.has(key as BlockTransformerNavigationKey)) {
    return key as BlockTransformerNavigationKey;
  }
  if (KEY_ALIASES[key]) return KEY_ALIASES[key];
  return KEY_CODES[keyCode] ?? null;
}

export function isSlashMenuNavigationKey(
  key: BlockTransformerNavigationKey,
) {
  return key === "Escape" || key === "Enter" ||
    key === "ArrowUp" || key === "ArrowDown";
}

export function eventPathContainsAny(
  event: Event,
  elements: readonly HTMLElement[],
) {
  const path = typeof event.composedPath === "function"
    ? event.composedPath()
    : [];
  if (elements.some(element => path.includes(element))) return true;

  const target = event.target;
  return elements.some(element => {
    const NodeCtor = element.ownerDocument.defaultView?.Node;
    return !!NodeCtor && target instanceof NodeCtor &&
      (element === target || element.contains(target));
  });
}

export function eventFocusBelongsToAny(
  event: Event,
  elements: readonly HTMLElement[],
) {
  if (eventPathContainsAny(event, elements)) return true;
  const ownerDocument = elements[0]?.ownerDocument;
  if (!ownerDocument) return false;

  const activeElement = ownerDocument.activeElement;
  if (
    activeElement &&
    elements.some(element =>
      element === activeElement || element.contains(activeElement)
    )
  ) return true;
  if (
    activeElement &&
    activeElement !== ownerDocument.body &&
    activeElement !== ownerDocument.documentElement
  ) return false;

  const focusNode = ownerDocument.getSelection()?.focusNode;
  return !!focusNode && elements.some(element => element.contains(focusNode));
}

export type BlockTransformerKeyboardCapture = {
  /** Stops accepting new keys while retaining the current physical-key tail. */
  close(): void;
  /** Removes every listener immediately. */
  dispose(): void;
};

export function installBlockTransformerKeyboardCapture(options: {
  ownerDocument: Document;
  elements: readonly HTMLElement[];
  accepts(key: BlockTransformerNavigationKey): boolean;
  isComposing(): boolean;
  onKey(key: BlockTransformerNavigationKey, event: KeyboardEvent): void;
  onTextKeyDown?(): void;
}): BlockTransformerKeyboardCapture {
  // One highest capture target is sufficient and avoids registering the same
  // Zone-wrapped handler at several points of one event path.
  const target: EventTarget =
    options.ownerDocument.defaultView ?? options.ownerDocument;

  const heldKeys = new Set<BlockTransformerNavigationKey>();
  const seenEvents = new WeakSet<Event>();
  let closed = false;
  let disposed = false;
  let tailTimer: ReturnType<typeof setTimeout> | null = null;

  const consume = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    (event as Event & {stopImmediatePropagation?(): void})
      .stopImmediatePropagation?.();
  };
  const belongsToSession = (event: Event) =>
    eventFocusBelongsToAny(event, options.elements);
  const finishTailIfPossible = () => {
    if (closed && heldKeys.size === 0) dispose();
  };
  const routeOnce = (event: Event, route: () => void) => {
    if (seenEvents.has(event)) return;
    seenEvents.add(event);
    route();
  };
  const onKeyDown = (event: KeyboardEvent) => routeOnce(event, () => {
    if (options.isComposing()) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const key = normalizeBlockTransformerNavigationKey(event.key, event.keyCode);
    if (!key || !options.accepts(key)) {
      if (!closed && belongsToSession(event)) options.onTextKeyDown?.();
      return;
    }
    // A physical key's post-keydown tail is keypress/beforeinput/keyup. Do not
    // swallow a later keydown after the overlay has closed; it may belong to a
    // newly opened surface during the bounded tail window.
    if (closed) return;
    if (!belongsToSession(event)) return;

    // Ownership is decided by the open surface, not by whether the picker has
    // finished loading enough data to move/select an item.
    consume(event);
    heldKeys.add(key);
    options.onKey(key, event);
  });
  const onKeyPress = (event: KeyboardEvent) => routeOnce(event, () => {
    const key = normalizeBlockTransformerNavigationKey(event.key, event.keyCode);
    if (!key || !options.accepts(key)) return;
    if (heldKeys.has(key) || (!closed && belongsToSession(event))) consume(event);
  });
  const onKeyUp = (event: KeyboardEvent) => routeOnce(event, () => {
    const key = normalizeBlockTransformerNavigationKey(event.key, event.keyCode);
    if (!key || !options.accepts(key)) return;
    if (heldKeys.has(key) || (!closed && belongsToSession(event))) consume(event);
    heldKeys.delete(key);
    finishTailIfPossible();
  });
  const onBeforeInput = (event: InputEvent) => routeOnce(event, () => {
    if (
      !["insertParagraph", "insertLineBreak", "insertTab"].includes(
        event.inputType,
      )
    ) return;
    if (
      heldKeys.has("Enter") || heldKeys.has("Tab") ||
      (!closed && belongsToSession(event))
    ) consume(event);
  });

  const listeners: ReadonlyArray<
    readonly [string, EventListener]
  > = [
    ["keydown", onKeyDown as EventListener],
    ["keypress", onKeyPress as EventListener],
    ["keyup", onKeyUp as EventListener],
    ["beforeinput", onBeforeInput as EventListener],
  ];
  for (const [type, listener] of listeners) {
    target.addEventListener(type, listener, true);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (tailTimer !== null) clearTimeout(tailTimer);
    tailTimer = null;
    for (const [type, listener] of listeners) {
      target.removeEventListener(type, listener, true);
    }
    heldKeys.clear();
  }

  return {
    close() {
      if (closed || disposed) return;
      closed = true;
      if (heldKeys.size === 0) {
        dispose();
        return;
      }
      // Enter commonly closes the overlay during keydown. Keep swallowing its
      // keypress/beforeinput/keyup tail so the editor outside cannot split or
      // submit after the picker has disappeared.
      tailTimer = setTimeout(dispose, EVENT_TAIL_TIMEOUT_MS);
    },
    dispose,
  };
}
