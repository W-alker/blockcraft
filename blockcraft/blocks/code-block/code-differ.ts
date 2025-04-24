import {DeltaInsertText} from "../../framework/block-std/types";
import {INLINE_ELEMENT_TAG, InlineManager} from "../../framework";

export function updateHighlightedTokens(container: HTMLElement, newTokens: DeltaInsertText[]) {
  const elements = Array.from(container.querySelectorAll(INLINE_ELEMENT_TAG))
  elements.pop()

  const oldLength = elements.length;
  const newLength = newTokens.length;
  let oldIndex = 0, newIndex = 0;

  while (oldIndex < oldLength || newIndex < newLength) {
    const oldToken = elements[oldIndex];
    const newToken = newTokens[newIndex];

    // Case 1: 删除旧节点
    if (oldIndex < oldLength && newIndex >= newLength) {
      elements[oldIndex].remove()
      oldIndex++;
    }
    // Case 2: 插入新节点
    else if (newIndex < newLength && oldIndex >= oldLength) {
      const newNode = createTokenNode(newToken);
      container.appendChild(newNode);
      newIndex++;
    }
    // Case 3: 替换变化的节点
    else if (
      isTokenChanged(oldToken as HTMLElement, newToken) // 检查是否有变化
    ) {
      const newNode = createTokenNode(newToken);
      elements[oldIndex].replaceWith(newNode)
      oldIndex++;
      newIndex++;
    }
    // Case 4: 节点相同，跳过
    else {
      oldIndex++;
      newIndex++;
    }
  }
}

// 判断两个 Token 是否发生变化
function isTokenChanged(oldToken: HTMLElement, newToken: DeltaInsertText): boolean {
  if (oldToken.textContent !== newToken.insert) {
    return true; // 内容不同必然变化
  }
  if (oldToken.getAttribute('type') !== newToken.attributes!['a:type']) {
    return true; // 类型不同必然变化
  }
  return oldToken.getAttribute('data-line-break') !== newToken.attributes!['d:line-break'];
}

// 创建一个高亮 Token 的 DOM 节点
function createTokenNode(token: DeltaInsertText) {
  return InlineManager.createTextNode(token)
}

