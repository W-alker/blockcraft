import {DeltaInsert} from "@core";

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


export default sliceDelta



