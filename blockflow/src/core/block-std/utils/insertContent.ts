import {BlockflowInline, DeltaInsert, findTextNodeByIndex} from "@core";

export const insertContent = (ele: HTMLElement, from: number, delta: DeltaInsert) => {
  // console.time('insertContent')
  if (!ele.textContent?.length) {
    const span = BlockflowInline.createView(delta as DeltaInsert)
    ele.innerHTML = span.outerHTML
    return
  }

  const {textNode, offset} = findTextNodeByIndex(ele, from)
  const parent = textNode.parentElement!
  const isSame = BlockflowInline.compareAttributesWithEle(parent, delta.attributes)

  if (isSame) {
    textNode.insertData(offset, delta.insert)
  } else {
    const span = BlockflowInline.createView(delta as DeltaInsert)
    if (offset === textNode.length) {
      if (!delta.attributes || !isSame) parent.after(span)
      else textNode.insertData(offset, delta.insert)
    } else if (offset === 0) {
      if (!delta.attributes || !isSame) parent.before(span)
      else textNode.insertData(offset, delta.insert)
    } else {
      const fragment = document.createDocumentFragment()
      const clone = parent.cloneNode() as HTMLElement
      clone.innerHTML = textNode.data!.slice(offset)
      parent.innerHTML = textNode.data!.slice(0, offset)
      fragment.appendChild(span)
      fragment.appendChild(clone)
      parent.after(fragment)
    }
  }
  // console.timeEnd('insertContent')
}
