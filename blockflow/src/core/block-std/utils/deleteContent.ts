export const deleteContent = (ele: HTMLElement, from: number, count: number) => {
  // console.time('deleteContent')
  let currentPos = 0;
  let end = from + count;

  if(ele.childNodes.length === 0) return;

  for (let i = 0; i < ele.childNodes.length; i++) {
    const child = ele.children[i];
    const textNode = child.firstChild as Text;
    const textLength = textNode.length;

    if (currentPos + textLength >= from && currentPos <= end) {
      const rangeStart = Math.max(0, from - currentPos);
      const rangeEnd = Math.min(textLength, end - currentPos);
      if(rangeStart === 0 && rangeEnd === textLength) {
        child.remove();
        i--
      } else {
        textNode.deleteData(rangeStart, rangeEnd - rangeStart);
      }
    }
    if(currentPos > end) break;
    currentPos += textLength;
  }
  // console.timeEnd('deleteContent')
}
