import {isEmbedElement} from "../../utils";

export const deleteContent = (ele: HTMLElement, from: number, count: number) => {
  // console.time('deleteContent')
  let currentPos = 0;
  let end = from + count;
  if (ele.childNodes.length === 0) return;
  for (let i = 0; i < ele.childNodes.length; i++) {
    const child = ele.childNodes[i];

    if (child instanceof Text) {
      const textLength = child.length

      if (currentPos + child.length >= from && currentPos <= end) {
        const rangeStart = Math.max(0, from - currentPos);
        const rangeEnd = Math.min(child.length, end - currentPos);
        if (rangeStart === 0 && rangeEnd === child.length) {
          child.remove();
          i--
        } else {
          child.deleteData(rangeStart, rangeEnd - rangeStart);
        }
      }

      currentPos += textLength;
      if (currentPos >= end) break;
      continue
    }

    if ((child as Element).tagName === 'BR') {
      child.remove();
      i--;
      continue;
    }

    const isEmbed = isEmbedElement(child);
    const textLength = isEmbed ? 1 : child.textContent?.length || 0;

    if (currentPos + textLength >= from && currentPos <= end) {
      const rangeStart = Math.max(0, from - currentPos);
      const rangeEnd = Math.min(textLength, end - currentPos);
      if (rangeStart === 0 && rangeEnd === textLength) {
        child.remove();
        i--
      } else {
        (child.firstChild as Text).deleteData(rangeStart, rangeEnd - rangeStart);
      }
    }

    currentPos += textLength;
    if (currentPos >= end) break;
  }
  // console.timeEnd('deleteContent')
}
