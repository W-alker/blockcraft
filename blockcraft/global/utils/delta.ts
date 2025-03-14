import {DeltaInsert} from "../../framework/types";

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
  const slicedOps = [];
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
      slicedOps.push({ insert, ...(op.attributes && { attributes: op.attributes }) });
    }

    offset += opLength;
  }

  return slicedOps;
}
