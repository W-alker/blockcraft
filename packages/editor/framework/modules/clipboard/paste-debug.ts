/**
 * Dev-only paste-format inspector.
 *
 * When enabled, dumps every clipboard MIME type and its raw payload to the
 * console on each paste. Use it to capture exactly what an external source
 * (Word / Google Docs / 有道云笔记 / Notion …) puts on the clipboard so adapter
 * matchers can be tuned against real-world HTML.
 *
 * Enable from the browser console (persists until the tab reloads):
 *
 *   window.__BC_PASTE_LOG__ = true     // log + collapse groups
 *   window.__BC_PASTE_LOG__ = 'raw'    // also print each format as a bare
 *                                       // string on its own line (easy to copy)
 *
 * Disable: `window.__BC_PASTE_LOG__ = false` (or reload).
 *
 * No-op in production unless the flag is explicitly set — never logs by default.
 */

const PASTE_LOG_FLAG = '__BC_PASTE_LOG__';

type PasteLogMode = false | true | 'raw';

function pasteLogMode(): PasteLogMode {
  if (typeof window === 'undefined') return false;
  const v = (window as unknown as Record<string, unknown>)[PASTE_LOG_FLAG];
  if (v === 'raw') return 'raw';
  return v === true;
}

export function isPasteLogEnabled(): boolean {
  return pasteLogMode() !== false;
}

export function logPasteFormats(clipboardData: DataTransfer | null): void {
  const mode = pasteLogMode();
  if (mode === false) return;
  if (typeof console === 'undefined') return;

  if (!clipboardData) {
    console.warn('[BC paste] no clipboardData on paste event');
    return;
  }

  const types = Array.from(clipboardData.types ?? []);
  const files = Array.from(clipboardData.files ?? []);

  try {
    // eslint-disable-next-line no-console
    console.groupCollapsed(
      `%c[BC paste]%c ${types.length} format(s): ${types.join(', ') || '(none)'}${files.length ? ` + ${files.length} file(s)` : ''}`,
      'color:#2563eb;font-weight:bold',
      'color:inherit'
    );

    for (const type of types) {
      if (type === 'Files') {
        // eslint-disable-next-line no-console
        console.log(
          `%c${type}%c`,
          'font-weight:bold;color:#16a34a',
          '',
          files.map(f => `${f.name} <${f.type || 'unknown'}, ${f.size}B>`)
        );
        continue;
      }

      const data = clipboardData.getData(type) ?? '';
      // eslint-disable-next-line no-console
      console.log(
        `%c${type}%c (${data.length} chars)`,
        'font-weight:bold;color:#16a34a',
        'color:#888'
      );
      // eslint-disable-next-line no-console
      console.log(data);
    }

    if (mode === 'raw') {
      // Bare-string dump: select a block and copy without the group chrome.
      for (const type of types) {
        if (type === 'Files') continue;
        // eslint-disable-next-line no-console
        console.log(`\n===== ${type} =====\n${clipboardData.getData(type) ?? ''}`);
      }
    }

    // eslint-disable-next-line no-console
    console.groupEnd();
  } catch (e) {
    console.warn('[BC paste] format log failed', e);
  }
}
