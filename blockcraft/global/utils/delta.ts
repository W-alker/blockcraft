import {DeltaInsert, IInlineNodeAttrs} from "../../framework";

// 将DeltaInsert[]根据其中的\n拆分成多个DeltaInsert[]
export const splitDeltaByLineBreak = (delta: DeltaInsert[], str_break = '\n'): DeltaInsert[][] => {
  const result: DeltaInsert[][] = [];
  let currentParagraph: DeltaInsert[] = [];

  for (const op of delta) {
    const {insert, attributes} = op;

    if (typeof insert !== 'string') {
      // embed 类型：直接加入当前段落
      currentParagraph.push(op);
      continue;
    }

    const lines = insert.split(str_break);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const isLast = i === lines.length - 1;

      if (line.length > 0) {
        currentParagraph.push({insert: line, attributes});
      }

      if (!isLast) {
        // \n 代表段落结束（可以选择保留它或省略）
        currentParagraph.push({insert: str_break, attributes});
        result.push(currentParagraph);
        currentParagraph = [];
      }
    }
  }

  if (currentParagraph.length > 0) {
    result.push(currentParagraph);
  }

  return result;
}

export const characterAtDelta = (deltas: DeltaInsert[], position: number): string | object | null => {
  let currentPosition = 1;

  for (let i = 0; i < deltas.length; i++) {
    const delta = deltas[i];

    if (typeof delta.insert === 'string') {
      // 如果 insert 是文本
      const insertText = delta.insert;
      const textLength = insertText.length;

      if (currentPosition + textLength >= position) {
        // 如果目标位置在当前 insert 字符串中
        const charIndex = position - currentPosition;
        return insertText.charAt(charIndex);
      }
      currentPosition += textLength;
    } else {
      // 如果是嵌入对象，算作一个字符
      if (currentPosition === position) {
        // 如果目标位置是嵌入对象的位置，返回该对象
        return delta.insert;
      }
      currentPosition += 1;
    }
  }

  // 如果遍历完所有 delta 后仍然没有找到，说明位置超出了长度
  return null;
}

export function sliceDelta(delta: DeltaInsert[], start = 0, end = Infinity) {
  const slicedOps: DeltaInsert[] = [];
  let offset = 0;

  for (const op of delta) {
    const opLength = typeof op.insert === 'string' ? op.insert.length : 1;

    if (offset + opLength <= start) {
      // 跳过当前操作，因为它完全在开始位置之前
      offset += opLength;
      continue;
    }

    if (offset >= end) {
      // 如果已经达到结束位置，则停止处理
      break;
    }

    let sliceStart = Math.max(start - offset, 0);
    let sliceEnd = Math.min(end - offset, opLength);
    const length = sliceEnd - sliceStart;

    if (length > 0) {
      const insert = typeof op.insert === 'string'
        ? op.insert.slice(sliceStart, sliceEnd)
        : op.insert;
      slicedOps.push({insert, ...(op.attributes && {attributes: op.attributes})});
    }

    offset += opLength;
  }

  return slicedOps;
}

export const getCommonAttributesFromDeltas = (delta: DeltaInsert[]) => {
  if (!delta.length) return {}
  let commonAttrs: IInlineNodeAttrs | undefined
  for (const op of delta) {
    if (!op.attributes) return {}
    if (!commonAttrs) {
      commonAttrs = {...op.attributes}
      continue
    }
    for (const key in commonAttrs) {
      // @ts-ignore
      if (commonAttrs[key] !== op.attributes[key]) {
        // @ts-ignore
        delete commonAttrs[key]
      }
    }
  }
  return commonAttrs || {}
}

export const deltaToString = (delta: DeltaInsert[], replaceEmbed = '') => {
  return delta.reduce((acc, cur) => acc + (typeof cur.insert === "string" ? cur.insert : replaceEmbed), '')
}

export const deltaStrLength = (delta: DeltaInsert[]) => {
  return delta.reduce((acc, cur) => acc + (typeof cur.insert === "string" ? cur.insert.length : 1), 0)
}

const isAttrsContain = (attrs: Record<string, any>, attrs2: Record<string, any>) => {
  for (const key in attrs2) {
    if (attrs2[key] !== attrs[key]) return false
  }
  return true
}

export function getSameAttributeRange(delta: DeltaInsert[], index: number, targetAttr: any): [number, number] {
  let pos = 0;
  let start = index;
  let end = index;

  // 一轮扫描，找到包含该 index 的 op 以及其属性
  for (let i = 0; i < delta.length; i++) {
    const op = delta[i];
    const length = typeof op.insert === 'string' ? op.insert.length : 1

    if (index >= pos && index < pos + length) {
      const attr = op.attributes || {};
      if (!isAttrsContain(attr, targetAttr)) return [index, index]; // 属性不一致
      start = pos;
      end = pos + length;

      // 向前合并
      for (let j = i - 1; j >= 0; j--) {
        const prev = delta[j];
        const prevText = typeof prev.insert === 'string' ? prev.insert : '';
        if (isAttrsContain(prev.attributes || {}, targetAttr)) {
          start -= prevText.length;
        } else {
          break;
        }
      }

      // 向后合并
      for (let j = i + 1; j < delta.length; j++) {
        const next = delta[j];
        const nextText = typeof next.insert === 'string' ? next.insert : '';
        if (isAttrsContain(next.attributes || {}, targetAttr)) {
          end += nextText.length;
        } else {
          break;
        }
      }

      break;
    }

    pos += length;
  }

  return [start, end];
}
