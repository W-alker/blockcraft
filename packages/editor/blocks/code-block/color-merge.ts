import {DeltaInsert, DeltaInsertText} from '../../framework/block-std/types';

type ColorAttrs = {'s:color'?: string; 's:background'?: string};

const COLOR_KEYS = ['s:color', 's:background'] as const;

interface ColorRun {
  start: number;
  end: number;
  attrs: ColorAttrs;
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
/** 从模型 deltas 抽取稀疏的用户颜色 run（只取 s:color / s:background）。 */
function toColorRuns(modelDeltas: DeltaInsert[]): ColorRun[] {
  const runs: ColorRun[] = [];
  let offset = 0;
  for (const op of modelDeltas) {
    const len = insertLen(op.insert);
    const attrs = op.attributes;
    if (attrs) {
      const picked: ColorAttrs = {};
      let has = false;
      for (const k of COLOR_KEYS) {
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
function runAt(runs: ColorRun[], abs: number): ColorRun | null {
  for (const r of runs) {
    if (abs < r.start) return null;
    if (abs < r.end) return r;
  }
  return null;
}

/** 严格大于 abs 的下一个 run 边界（无则 Infinity）。 */
function nextBoundary(runs: ColorRun[], abs: number): number {
  for (const r of runs) {
    if (abs < r.start) return r.start;
    if (abs < r.end) return r.end;
  }
  return Infinity;
}

/**
 * 把用户颜色 attr 叠加到 Shiki deltas 之上。
 * 两个输入覆盖「同一份纯文本」；用户键优先（s:color 覆盖、s:background 叠加）。
 * 保留 Shiki deltas 上的 d:lineBreak 等结构性 attr；不对 lineBreak 段染色。
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
  const runs = toColorRuns(modelDeltas);
  if (!runs.length) return shikiDeltas;

  const out: DeltaInsertText[] = [];
  let offset = 0;
  for (const op of shikiDeltas) {
    const text = op.insert;
    if (op.attributes?.['d:lineBreak']) {
      out.push(op);
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
        out.push({insert: slice, attributes: {...op.attributes, ...run.attrs}});
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
// 指纹含 s:background，使「纯背景色变更」也能被行级 diff 检测到。
/** 行级 diff 指纹：text + s:color + s:background。 */
export const deltaFingerprint = (d: DeltaInsertText): string =>
  `${d.insert}\0${d.attributes?.['s:color'] || ''}\0${d.attributes?.['s:background'] || ''}\0`;
