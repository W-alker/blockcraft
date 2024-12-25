import {CharacterIndex, Controller, createRangeByCharacterRange} from "../core";

export class BlockFlowCursor {

  constructor(
    public readonly controller: Controller
  ) {
  }

  public static createVirtualRange(id: string, start: CharacterIndex, end: CharacterIndex) {
    const ele = document.getElementById(id);
    if (!ele) throw new Error(`Element with id ${id} not found`);
    const wrap = ele.parentElement!

    const cursorEle = document.createElement('span');
    cursorEle.className = 'blockflow-cursor';

    // console.time('createRangeByCharacterRange')
    const _r = createRangeByCharacterRange(ele, start, end);
    // console.timeEnd('createRangeByCharacterRange')
    const _rRects = _r.getClientRects();
    const wrapRect = wrap.getBoundingClientRect();

    for (let i = 0; i < _rRects.length; i++) {
      const rect = _rRects[i];
      if (rect.width <= 0) continue;
      rect.width = Math.max(1, rect.width)
      const span = document.createElement('span');
      span.style.cssText = `
        left: ${rect.left - wrapRect.left}px;
        top: ${rect.top - wrapRect.top}px;
        width: ${rect.width}px;
        height: ${rect.height}px;
      `
      cursorEle.appendChild(span)
    }
    wrap.appendChild(cursorEle);
    return cursorEle;
  }


}
