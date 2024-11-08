import {isEmbedElement} from "../../utils";

export const deleteContent = (ele: HTMLElement, from: number, count: number) => {
  // console.time('deleteContent')
  let currentPos = 0;
  let end = from + count;

  if(ele.childNodes.length === 0) return;

  for (let i = 0; i < ele.childNodes.length; i++) {
    const child = ele.children[i];
    if(child.tagName === 'BR') {
      child.remove();
      i--;
      continue;
    }

    const isEmbed = isEmbedElement(child);
    const textLength = isEmbed ? 1 : child.textContent?.length || 1;

    if (currentPos + textLength >= from && currentPos <= end) {
      const rangeStart = Math.max(0, from - currentPos);
      const rangeEnd = Math.min(textLength, end - currentPos);
      if(rangeStart === 0 && rangeEnd === textLength) {
        child.remove();
        i--
      } else {
        (child.firstChild as Text).deleteData(rangeStart, rangeEnd - rangeStart);
      }
    }
    if(currentPos > end) break;
    currentPos += textLength;
  }
  // console.timeEnd('deleteContent')
}
