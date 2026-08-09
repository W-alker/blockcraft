import {
  PageChrome,
  PageChromeInlineContent,
  PageChromeImageContent,
} from "../pagination.types";

type ChromeAlign = 'left' | 'center' | 'right';

/** 是否存在至少一个可渲染的结构化项。 */
export function hasChromeInlineContent(content: PageChromeInlineContent | undefined): boolean {
  return !!content?.items?.some(item =>
    item.kind === 'image' ? !!item.src : !!item.text,
  );
}

/** live 与打印页共用的单区域 DOM 构建器。 */
export function createChromeSegmentElement(input: {
  className: string;
  text?: string;
  content?: PageChromeInlineContent;
  align: ChromeAlign;
}): HTMLElement {
  const element = document.createElement('span');
  element.className = input.className;
  element.style.textAlign = input.align;
  if (!hasChromeInlineContent(input.content)) {
    element.textContent = input.text || '';
    return element;
  }

  element.classList.add('bc-page-chrome-rich', `bc-page-chrome-rich--${input.align}`);
  element.style.display = 'flex';
  element.style.alignItems = 'center';
  element.style.justifyContent = input.align === 'left'
    ? 'flex-start'
    : input.align === 'right'
      ? 'flex-end'
      : 'center';
  element.style.gap = `${finiteSize(input.content?.gap, 4, 0, 40)}px`;
  element.style.minWidth = '0';

  for (const item of input.content!.items) {
    if (item.kind === 'image') {
      if (!item.src) continue;
      element.appendChild(createImageItem(item));
      continue;
    }
    if (!item.text) continue;
    const text = document.createElement('span');
    text.className = `bc-page-chrome-text bc-page-chrome-text--${item.tone ?? 'default'}`;
    text.textContent = item.text;
    text.style.whiteSpace = 'nowrap';
    if (item.tone === 'muted') {
      text.style.color = 'var(--bc-page-chrome-muted-color, #999)';
    }
    element.appendChild(text);
  }
  return element;
}

/** live 与打印页共用的页眉/页脚外观。 */
export function applyChromeAppearance(element: HTMLElement, chrome: PageChrome | undefined): void {
  if (!chrome?.separator) return;
  element.classList.add(`bc-page-chrome--separator-${chrome.separator}`);
  element.style.boxSizing = 'border-box';
  if (chrome.separator === 'top') {
    element.style.borderTop = '1px solid var(--bc-page-chrome-separator-color, #ebebeb)';
    element.style.paddingTop = '6px';
  } else {
    element.style.borderBottom = '1px solid var(--bc-page-chrome-separator-color, #ebebeb)';
    element.style.paddingBottom = '6px';
  }
}

function createImageItem(item: PageChromeImageContent): HTMLImageElement {
  const image = document.createElement('img');
  image.className = 'bc-page-chrome-image';
  image.src = item.src;
  image.alt = item.alt ?? '';
  image.decoding = 'async';
  image.draggable = false;
  image.style.display = 'block';
  image.style.flex = '0 0 auto';
  image.style.objectFit = 'contain';
  if (Number.isFinite(item.width)) image.style.width = `${finiteSize(item.width, 0, 0, 400)}px`;
  if (Number.isFinite(item.height)) image.style.height = `${finiteSize(item.height, 0, 0, 200)}px`;
  if (Number.isFinite(item.maxWidth)) image.style.maxWidth = `${finiteSize(item.maxWidth, 0, 0, 400)}px`;
  if (Number.isFinite(item.borderRadius)) {
    image.style.borderRadius = `${finiteSize(item.borderRadius, 0, 0, 100)}px`;
  }
  return image;
}

function finiteSize(value: number | undefined, fallback: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Number(value))) : fallback;
}
