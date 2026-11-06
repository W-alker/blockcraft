import type {HotKeyTrigger} from "../../framework";
import {IS_MAC} from "../../global";
import {createPinyinInitials} from "./search";

export function formatHotKeyHint(
  trigger: HotKeyTrigger | undefined,
  isMac = IS_MAC,
) {
  if (!trigger) return undefined;
  const modifiers: string[] = [];
  const add = (value: string) => {
    if (!modifiers.includes(value)) modifiers.push(value);
  };

  if (trigger.shortKey) add(isMac ? "⌘" : "Ctrl");
  if (trigger.ctrlKey) add(isMac ? "⌃" : "Ctrl");
  if (trigger.metaKey) add(isMac ? "⌘" : "Meta");
  if (trigger.altKey) add(isMac ? "⌥" : "Alt");
  if (trigger.shiftKey) add(isMac ? "⇧" : "Shift");

  const key = (Array.isArray(trigger.key) ? trigger.key[0] : trigger.key)
    ?.toUpperCase();
  if (!key) return modifiers.join(isMac ? "" : "+") || undefined;
  return [...modifiers, key].join(isMac ? "" : "+");
}

export function resolveSlashSearchAlias(
  label: string,
  configuredAlias?: string,
) {
  const configured = configuredAlias?.trim().replace(/^\/+/, "");
  return configured || createPinyinInitials(label) || undefined;
}
