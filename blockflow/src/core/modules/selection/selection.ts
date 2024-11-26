/*
* @desc handle the deep level
* 根据纯文本的字符索引找到DOM节点里所在的文本节点和索引
* @param {HTMLElement} element - 容器元素
* @param {number} index - 纯文本的字符索引
* @returns {IFocusSelection} - 文本节点和偏移量
 */
const findTextNodeAndLastIndexByCharacterIndex = (element = document.activeElement!, pos: number): {
  node: Text | Node,
  offset: number
} => {

  if (pos === 0) return {node: element.firstChild!.firstChild!, offset: 0}
  if (pos === element.textContent!.length) return {
    node: element.lastChild!.lastChild!,
    offset: element.lastChild!.textContent!.length
  }

  let foundNode: Text
  let lastIndex = -1;
  let index = pos;

  function find(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (index <= (node as Text).length) {
        foundNode = node as Text;
        lastIndex = index;
      } else {
        index -= (node as Text).length;
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      if (!(node as HTMLElement).isContentEditable) {
        index -= node.textContent!.length
      } else {
        for (let i = 0; i < node.childNodes.length; i++) {
          find(node.childNodes[i]);
          if (foundNode) return;
        }
      }
    }
  }

  find(element);
  return {
    node: foundNode!,
    offset: lastIndex
  };
}
