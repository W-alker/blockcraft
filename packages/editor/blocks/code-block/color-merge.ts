import {
  DeltaInsert,
  DeltaInsertText,
  DeltaOperation,
  IInlineNodeAttrs,
} from '../../framework/block-std/types';

const MODEL_PRESENTATION_KEYS = [
  's:color',
  's:background',
  's:display',
  'a:data-bc-revision-ids',
  'a:data-bc-revision-kind',
  'a:data-bc-revision-state',
] as const;
const LINE_BREAK_IGNORED_KEYS = new Set<string>(['s:color', 's:background']);

interface PresentationRun {
  start: number;
  end: number;
  attrs: IInlineNodeAttrs;
}

const insertLen = (insert: DeltaInsert['insert']): number =>
  typeof insert === 'string' ? insert.length : 1;

/**
 * 契约：modelDeltas 来自 Y.Text.toDelta()。用户「清除颜色」走
 * yText.format(i, len, {'s:color': null})，Yjs 会移除该 key，故 toDelta() 不会
 * 带 null 颜色值——这里 `v != null` 仅作防御。清除后该范围无 color run，
 * 渲染时 Shiki 原色自然透出（正确）。
 * 切勿把 null 放进合并结果去 override：setAttributes 视 null 为「删除样式」，
 * 会连 Shiki 色一起抹掉。
 */
/** 从模型 deltas 抽取需要覆盖 Shiki 的用户色彩与临时修订投影。 */
function toPresentationRuns(modelDeltas: DeltaInsert[]): PresentationRun[] {
  const runs: PresentationRun[] = [];
  let offset = 0;
  for (const op of modelDeltas) {
    const len = insertLen(op.insert);
    const attrs = op.attributes;
    if (attrs) {
      const picked: IInlineNodeAttrs = {};
      let has = false;
      for (const k of MODEL_PRESENTATION_KEYS) {
        const v = attrs[k];
        if (v != null) {
          picked[k] = v as string;
          has = true;
        }
      }
      if (has) runs.push({start: offset, end: offset + len, attrs: picked});
    }
    offset += len;
  }
  return runs;
}

/** 覆盖 abs 的 run（run 升序、不重叠），无则 null。 */
function runAt(runs: PresentationRun[], abs: number): PresentationRun | null {
  for (const r of runs) {
    if (abs < r.start) return null;
    if (abs < r.end) return r;
  }
  return null;
}

/** 严格大于 abs 的下一个 run 边界（无则 Infinity）。 */
function nextBoundary(runs: PresentationRun[], abs: number): number {
  for (const r of runs) {
    if (abs < r.start) return r.start;
    if (abs < r.end) return r.end;
  }
  return Infinity;
}

/**
 * Shiki writes foreground/background colors as inline styles. While a code
 * fragment is visibly marked for review those inline declarations would beat
 * the revision theme selectors, so remove only the competing presentation
 * styles. Once the fragment is no longer marked, the next projection keeps
 * the original Shiki colors again.
 */
function letRevisionThemeOwnColors(attrs: IInlineNodeAttrs): IInlineNodeAttrs {
  const state = attrs['a:data-bc-revision-state'];
  if (state !== 'pending' && state !== 'conflict') return attrs;
  const themed = {...attrs};
  delete themed['s:color'];
  delete themed['s:background'];
  return themed;
}

/**
 * 把模型展示 attr 叠加到 Shiki deltas 之上。
 * 两个输入覆盖「同一份纯文本」；用户色彩和临时修订属性优先。
 * 保留 Shiki deltas 上的 d:lineBreak 等结构性 attr；lineBreak 不继承用户
 * 颜色，但仍保留修订归因与隐藏状态。
 *
 * 契约：modelDeltas 与 shikiDeltas 必须描述同一字符序列、同一偏移空间。
 * modelDeltas 只能含 string insert 或 break embed（均计长度 1，与 textContent() 的
 * break→'\n' 映射一致）。代码块是 plainTextOnly，不会有 mention/link/latex 等非 break
 * 内联 embed（那些在 textContent() 里计 0 长，会破坏对齐），故此约束天然成立。
 */
export function mergeColorOverShiki(
  shikiDeltas: DeltaInsertText[],
  modelDeltas: DeltaInsert[],
): DeltaInsertText[] {
  const runs = toPresentationRuns(modelDeltas);
  if (!runs.length) return shikiDeltas;

  const out: DeltaInsertText[] = [];
  let offset = 0;
  for (const op of shikiDeltas) {
    const text = op.insert;
    if (op.attributes?.['d:lineBreak']) {
      const run = runAt(runs, offset);
      const attrs = {...(op.attributes ?? {})};
      if (run) {
        for (const [key, value] of Object.entries(run.attrs)) {
          if (!LINE_BREAK_IGNORED_KEYS.has(key)) attrs[key] = value;
        }
      }
      out.push({insert: text, attributes: attrs});
      offset += text.length;
      continue;
    }
    let i = 0;
    while (i < text.length) {
      const abs = offset + i;
      const run = runAt(runs, abs);
      const end = Math.min(text.length, nextBoundary(runs, abs) - offset);
      const slice = text.slice(i, end);
      if (run) {
        out.push({
          insert: slice,
          attributes: letRevisionThemeOwnColors({...op.attributes, ...run.attrs}),
        });
      } else {
        out.push(op.attributes ? {insert: slice, attributes: op.attributes} : {insert: slice});
      }
      i = end;
    }
    offset += text.length;
  }
  return out;
}

// CodeInlineRuntime.groupTokenLines 用本函数算行指纹。
// 指纹包含所有覆盖 Shiki 的展示属性，使纯样式/修订状态变化也能触发行级 diff。
export const deltaFingerprint = (d: DeltaInsertText): string =>
  `${d.insert}\0${MODEL_PRESENTATION_KEYS.map(key =>
    `${key}:${d.attributes?.[key] ?? ''}`).join('\0')}\0`;

/**
 * 判断一组 delta op 是否「纯格式变更」：只有 retain（可带 attributes），无 insert/delete。
 * 例如选区染色——文本未变，故语法高亮 / mermaid 图都无需重渲，调用方可据此跳过。
 */
export const isFormatOnlyDelta = (ops: DeltaOperation[]): boolean =>
  ops.length > 0 && ops.every(o => o.retain !== undefined && o.insert === undefined && o.delete === undefined);
