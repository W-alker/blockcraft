import {DeltaInsert} from "../../types";

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
