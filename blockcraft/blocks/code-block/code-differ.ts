import {Token} from "prismjs";

export type _Token = string | Token

export function updateHighlightedTokens(container: HTMLElement, oldTokens: _Token[], newTokens: _Token[]) {
  const oldLength = oldTokens.length;
  const newLength = newTokens.length;
  let oldIndex = 0, newIndex = 0;

  const childNodes = Array.from(container.childNodes); // 确保节点快照一致

  while (oldIndex < oldLength || newIndex < newLength) {
    const oldToken = oldTokens[oldIndex];
    const newToken = newTokens[newIndex];

    // Case 1: 删除旧节点
    if (oldIndex < oldLength && newIndex >= newLength) {
      container.removeChild(childNodes[oldIndex]);
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
      isTokenChanged(oldToken, newToken) // 检查是否有变化
    ) {
      const newNode = createTokenNode(newToken);
      container.replaceChild(newNode, childNodes[oldIndex]);
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
function isTokenChanged(oldToken: _Token, newToken: _Token):boolean {
  if (typeof oldToken === 'string' && typeof newToken === 'string') {
    return oldToken !== newToken;
  }

  if (typeof oldToken === 'object' && typeof newToken === 'object') {
    if (oldToken.type !== newToken.type) return true;
    return compareTokenContent(oldToken.content, newToken.content);
  }

  return true; // 类型不同必然变化
}

// 比较 TokenStream 的内容（支持嵌套数组）
function compareTokenContent(oldContent: Token['content'], newContent: Token['content']) {
  if (typeof oldContent === 'string' && typeof newContent === 'string') {
    return oldContent !== newContent;
  }

  if (Array.isArray(oldContent) && Array.isArray(newContent)) {
    if (oldContent.length !== newContent.length) return true;
    for (let i = 0; i < oldContent.length; i++) {
      if (isTokenChanged(oldContent[i], newContent[i])) {
        return true;
      }
    }
    return false;
  }

  if (typeof oldContent === 'object' && typeof newContent === 'object') {
    return isTokenChanged(oldContent as any, newContent as any);
  }

  return true; // 不同类型或无法比较时认为内容已变
}

// 创建一个高亮 Token 的 DOM 节点
function createTokenNode(token: _Token) {
  const span = document.createElement('span');

  if (typeof token === 'string') {
    if(token.startsWith('\n')) {
      span.className = 'line-break';
    }
    // Token 是纯字符串
    span.textContent = token;
  } else if (typeof token === 'object') {
    // Token 是对象
    span.className = `${token.type}`; // 样式类
    if (Array.isArray(token.content)) {
      // 递归创建子节点
      token.content.forEach(subToken => {
        span.appendChild(createTokenNode(subToken));
      });
    } else {
      span.textContent = token.content as string
    }
  }

  return span;
}

