import {BlockModel} from "@core";

export const updateOrderAround = (block: BlockModel) => {
  const yParent = block.yModel.parent;

}

interface Paragraph {
  order?: number; // 用于有序列表项的序号
  indentLevel: number; // 缩进级别
  type: 'ordered' | 'unordered' | 'text'; // 段落类型（可以扩展）
}

function updateOrderedParagraphs(paragraphs: Paragraph[], startIndex: number): void {
  const targetParagraph = paragraphs[startIndex];
  if (!targetParagraph || targetParagraph.type !== 'ordered') {
    throw new Error('Invalid starting paragraph: must be an ordered paragraph.');
  }

  let currentIndentLevel = targetParagraph.indentLevel;

  // Step 1: 向前查找列表的起始位置，更新之前的同层级有序段落
  let startOrder = 1;
  for (let i = startIndex - 1; i >= 0; i--) {
    const para = paragraphs[i];
    if (para.type === 'ordered' && para.indentLevel === currentIndentLevel) {
      startOrder = para.order || 1;
      break;
    } else if (para.type !== 'ordered' || para.indentLevel < currentIndentLevel) {
      break; // 找到比当前缩进更少的段落，停止查找
    }
  }

  // Step 2: 从startIndex开始，向后更新所有相邻的有序段落
  let currentOrder = startOrder;
  for (let i = startIndex; i < paragraphs.length; i++) {
    const para = paragraphs[i];

    // 如果是同一缩进层级的有序段落，更新其序号
    if (para.type === 'ordered' && para.indentLevel === currentIndentLevel) {
      para.order = currentOrder++;
    }
    // 如果是子列表，递归更新子列表的序号
    else if (para.type === 'ordered' && para.indentLevel > currentIndentLevel) {
      updateOrderedParagraphs(paragraphs, i);
    }
    // 遇到不同类型的段落或不同缩进层级的段落，停止更新
    else if (para.indentLevel < currentIndentLevel || para.type !== 'ordered') {
      break;
    }
  }
}

reOrderListBrick() {
  let prevOlIndentAndOrderMap: Record<number, number> = {}
  let prevTag = ''
  this.modelStructure.forEach(item => {
    if(item.tag === 'ol') {
      if(prevTag !== 'ol' && item.data.indent === 0) {
        item.data.order = 0
        prevOlIndentAndOrderMap = {}
      }

      else if(typeof prevOlIndentAndOrderMap[item.data.indent] === 'undefined') {
        item.data.order = 0
      }

      else  {
        item.data.order = prevOlIndentAndOrderMap[item.data.indent] + 1
      }

      prevOlIndentAndOrderMap[item.data.indent] = item.data.order
    }

    prevTag = item.tag
  })
}
