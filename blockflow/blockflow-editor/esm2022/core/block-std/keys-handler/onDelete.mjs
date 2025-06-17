import { USER_CHANGE_SIGNAL } from "../../yjs";
export const onDelete = (e, controller) => {
    const curRange = controller.selection.getSelection();
    if (curRange.isAtRoot) {
        e.preventDefault();
        const res = controller.deleteSelectedBlocks();
        if (!res || res[1] >= controller.rootModel.length)
            return;
        const end = controller.rootModel[res[1]];
        controller.selection.focusTo(end.id, 'start');
        return;
    }
    const activeElement = document.activeElement;
    const { blockId, blockRange } = curRange;
    const bRef = controller.getBlockRef(blockId);
    // At end of block
    if (blockRange.start === bRef.textLength && blockRange.end === bRef.textLength) {
        e.preventDefault();
        const position = controller.getBlockPosition(bRef.id);
        // If it's the last block, don't do anything
        if (position.parentId !== controller.rootId || position.index >= controller.rootModel.length - 1)
            return;
        const nextBlockModel = controller.findNextBlockModel(bRef.id);
        // If next block is not editable, select the next block
        if (!controller.isEditable(nextBlockModel)) {
            controller.selection.setSelection(controller.rootId, position.index + 1, position.index + 2);
            return;
        }
        // Merge with next editable block
        const nextBlock = controller.getBlockRef(nextBlockModel.id);
        if (!bRef.textLength) {
            controller.deleteBlocks(position.index, 1);
            nextBlock.setSelection(0);
            return;
        }
        controller.transact(() => {
            bRef.applyDelta([{ retain: bRef.textLength }, ...nextBlock.getTextDelta()], false);
            controller.deleteBlockById(nextBlock.id);
        }, USER_CHANGE_SIGNAL);
        return;
    }
    // const yText = bRef.yText
    // const selection = window.getSelection()!
    // if (selection.isCollapsed) {
    //
    //   const {focusNode, focusOffset} = selection
    //
    //   const deleteNextEle = (nextEle: HTMLElement) => {
    //     controller.transact(() => {
    //       nextEle.remove()
    //       yText.delete(blockRange.start, 1)
    //     }, USER_CHANGE_SIGNAL)
    //   }
    //
    //   if (focusNode === activeElement) {
    //     const nextElement = activeElement.children[focusOffset]
    //
    //     if (nextElement instanceof HTMLElement && isEmbedElement(nextElement)) {
    //       return deleteNextEle(nextElement)
    //     }
    //
    //     setCursorBefore(nextElement, selection)
    //   }
    //
    //   if (!focusNode?.textContent || focusOffset === focusNode.textContent.length) {
    //     const parentNode = focusNode!.parentElement!
    //     const nextNode = parentNode === activeElement ? focusNode!.nextSibling : parentNode.nextSibling
    //
    //     if (nextNode && isEmbedElement(nextNode)) {
    //       return deleteNextEle(<HTMLElement>nextNode)
    //     }
    //
    //     nextNode && setCursorBefore(nextNode, selection)
    //   }
    //
    //   controller.transact(() => {
    //     const {focusNode, focusOffset} = selection;
    //
    //     selection.modify('move', 'forward', 'character')
    //     const textNode = focusNode as Text
    //     textNode.deleteData(focusOffset, 1);
    //     yText.delete(blockRange.start, 1)
    //
    //     if (!textNode.length) {
    //       const parentNode = textNode.parentElement!
    //
    //       if (parentNode === activeElement) {
    //         textNode.remove()
    //         return
    //       }
    //
    //       const prevNode = parentNode.nextSibling!
    //       parentNode.remove()
    //       setCursorBefore(prevNode, selection)
    //     }
    //
    //   }, USER_CHANGE_SIGNAL)
    //   return;
    // }
    //
    // const deltas = [
    //   {retain: blockRange.start},
    //   {delete: blockRange.end - blockRange.start},
    // ]
    // adjustRangeEdges(bRef.containerEle, selection.getRangeAt(0))
    // selection.collapseToEnd()
    // bRef.applyDelta(deltas)
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib25EZWxldGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi9ibG9ja2Zsb3cvc3JjL2NvcmUvYmxvY2stc3RkL2tleXMtaGFuZGxlci9vbkRlbGV0ZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFFQSxPQUFPLEVBQUMsa0JBQWtCLEVBQUMsTUFBTSxXQUFXLENBQUM7QUFHN0MsTUFBTSxDQUFDLE1BQU0sUUFBUSxHQUFxQixDQUFDLENBQUMsRUFBRSxVQUFVLEVBQUUsRUFBRTtJQUUxRCxNQUFNLFFBQVEsR0FBRyxVQUFVLENBQUMsU0FBUyxDQUFDLFlBQVksRUFBRyxDQUFBO0lBQ3JELElBQUksUUFBUSxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQ3RCLENBQUMsQ0FBQyxjQUFjLEVBQUUsQ0FBQTtRQUVsQixNQUFNLEdBQUcsR0FBRyxVQUFVLENBQUMsb0JBQW9CLEVBQUUsQ0FBQTtRQUM3QyxJQUFJLENBQUMsR0FBRyxJQUFJLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxVQUFVLENBQUMsU0FBUyxDQUFDLE1BQU07WUFBRSxPQUFNO1FBQ3pELE1BQU0sR0FBRyxHQUFHLFVBQVUsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUE7UUFDeEMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLEVBQUUsRUFBRSxPQUFPLENBQUMsQ0FBQTtRQUM3QyxPQUFNO0lBQ1IsQ0FBQztJQUVELE1BQU0sYUFBYSxHQUFHLFFBQVEsQ0FBQyxhQUE0QixDQUFBO0lBQzNELE1BQU0sRUFBQyxPQUFPLEVBQUUsVUFBVSxFQUFDLEdBQUcsUUFBUSxDQUFBO0lBQ3RDLE1BQU0sSUFBSSxHQUFHLFVBQVUsQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFrQixDQUFBO0lBRTdELGtCQUFrQjtJQUNsQixJQUFJLFVBQVUsQ0FBQyxLQUFLLEtBQUssSUFBSSxDQUFDLFVBQVUsSUFBSSxVQUFV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LCtEQUErRDtJQUMvRCw0QkFBNEI7SUFDNUIsMEJBQTBCO0FBQzVCLENBQUMsQ0FBQSIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7SUtleUV2ZW50SGFuZGxlcn0gZnJvbSBcIi4va2V5RXZlbnRCdXNcIjtcbmltcG9ydCB7RWRpdGFibGVCbG9ja30gZnJvbSBcIi4uL2NvbXBvbmVudHNcIjtcbmltcG9ydCB7VVNFUl9DSEFOR0VfU0lHTkFMfSBmcm9tIFwiLi4vLi4veWpzXCI7XG5pbXBvcnQge2FkanVzdFJhbmdlRWRnZXMsIGlzRW1iZWRFbGVtZW50LCBzZXRDdXJzb3JCZWZvcmV9IGZyb20gXCIuLi8uLi91dGlsc1wiO1xuXG5leHBvcnQgY29uc3Qgb25EZWxldGU6IElLZXlFdmVudEhhbmRsZXIgPSAoZSwgY29udHJvbGxlcikgPT4ge1xuXG4gIGNvbnN0IGN1clJhbmdlID0gY29udHJvbGxlci5zZWxlY3Rpb24uZ2V0U2VsZWN0aW9uKCkhXG4gIGlmIChjdXJSYW5nZS5pc0F0Um9vdCkge1xuICAgIGUucHJldmVudERlZmF1bHQoKVxuXG4gICAgY29uc3QgcmVzID0gY29udHJvbGxlci5kZWxldGVTZWxlY3RlZEJsb2NrcygpXG4gICAgaWYgKCFyZXMgfHwgcmVzWzFdID49IGNvbnRyb2xsZXIucm9vdE1vZGVsLmxlbmd0aCkgcmV0dXJuXG4gICAgY29uc3QgZW5kID0gY29udHJvbGxlci5yb290TW9kZWxbcmVzWzFdXVxuICAgIGNvbnRyb2xsZXIuc2VsZWN0aW9uLmZvY3VzVG8oZW5kLmlkLCAnc3RhcnQnKVxuICAgIHJldHVyblxuICB9XG5cbiAgY29uc3QgYWN0aXZlRWxlbWVudCA9IGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgYXMgSFRNTEVsZW1lbnRcbiAgY29uc3Qge2Jsb2NrSWQsIGJsb2NrUmFuZ2V9ID0gY3VyUmFuZ2VcbiAgY29uc3QgYlJlZiA9IGNvbnRyb2xsZXIuZ2V0QmxvY2tSZWYoYmxvY2tJZCkgYXMgRWRpdGFibGVCbG9ja1xuXG4gIC8vIEF0IGVuZCBvZiBibG9ja1xuICBpZiAoYmxvY2tSYW5nZS5zdGFydCA9PT0gYlJlZi50ZXh0TGVuZ3RoICYmIGJsb2NrUmFuZ2UuZW5kID09PSBiUmVmLnRleHRMZW5ndGgpIHtcbiAgICBlLnByZXZlbnREZWZhdWx0KClcblxuICAgIGNvbnN0IHBvc2l0aW9uID0gY29udHJvbGxlci5nZXRCbG9ja1Bvc2l0aW9uKGJSZWYuaWQpXG5cbiAgICAvLyBJZiBpdCdzIHRoZSBsYXN0IGJsb2NrLCBkb24ndCBkbyBhbnl0aGluZ1xuICAgIGlmIChwb3NpdGlvbi5wYXJlbnRJZCAhPT0gY29udHJvbGxlci5yb290SWQgfHwgcG9zaXRpb24uaW5kZXggPj0gY29udHJvbGxlci5yb290TW9kZWwubGVuZ3RoIC0gMSkgcmV0dXJuXG5cbiAgICBjb25zdCBuZXh0QmxvY2tNb2RlbCA9IGNvbnRyb2xsZXIuZmluZE5leHRCbG9ja01vZGVsKGJSZWYuaWQpIVxuXG4gICAgLy8gSWYgbmV4dCBibG9jayBpcyBub3QgZWRpdGFibGUsIHNlbGVjdCB0aGUgbmV4dCBibG9ja1xuICAgIGlmICghY29udHJvbGxlci5pc0VkaXRhYmxlKG5leHRCbG9ja01vZGVsKSkge1xuICAgICAgY29udHJvbGxlci5zZWxlY3Rpb24uc2V0U2VsZWN0aW9uKGNvbnRyb2xsZXIucm9vdElkLCBwb3NpdGlvbi5pbmRleCArIDEsIHBvc2l0aW9uLmluZGV4ICsgMilcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIC8vIE1lcmdlIHdpdGggbmV4dCBlZGl0YWJsZSBibG9ja1xuICAgIGNvbnN0IG5leHRCbG9jayA9IGNvbnRyb2xsZXIuZ2V0QmxvY2tSZWYobmV4dEJsb2NrTW9kZWwuaWQpIGFzIEVkaXRhYmxlQmxvY2tcbiAgICBpZiAoIWJSZWYudGV4dExlbmd0aCkge1xuICAgICAgY29udHJvbGxlci5kZWxldGVCbG9ja3MocG9zaXRpb24uaW5kZXgsIDEpXG4gICAgICBuZXh0QmxvY2suc2V0U2VsZWN0aW9uKDApXG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnRyb2xsZXIudHJhbnNhY3QoKCkgPT4ge1xuICAgICAgYlJlZi5hcHBseURlbHRhKFt7cmV0YWluOiBiUmVmLnRleHRMZW5ndGh9LCAuLi5uZXh0QmxvY2suZ2V0VGV4dERlbHRhKCldLCBmYWxzZSlcbiAgICAgIGNvbnRyb2xsZXIuZGVsZXRlQmxvY2tCeUlkKG5leHRCbG9jay5pZClcbiAgICB9LCBVU0VSX0NIQU5HRV9TSUdOQUwpXG4gICAgcmV0dXJuXG4gIH1cblxuICAvLyBjb25zdCB5VGV4dCA9IGJSZWYueVRleHRcbiAgLy8gY29uc3Qgc2VsZWN0aW9uID0gd2luZG93LmdldFNlbGVjdGlvbigpIVxuICAvLyBpZiAoc2VsZWN0aW9uLmlzQ29sbGFwc2VkKSB7XG4gIC8vXG4gIC8vICAgY29uc3Qge2ZvY3VzTm9kZSwgZm9jdXNPZmZzZXR9ID0gc2VsZWN0aW9uXG4gIC8vXG4gIC8vICAgY29uc3QgZGVsZXRlTmV4dEVsZSA9IChuZXh0RWxlOiBIVE1MRWxlbWVudCkgPT4ge1xuICAvLyAgICAgY29udHJvbGxlci50cmFuc2FjdCgoKSA9PiB7XG4gIC8vICAgICAgIG5leHRFbGUucmVtb3ZlKClcbiAgLy8gICAgICAgeVRleHQuZGVsZXRlKGJsb2NrUmFuZ2Uuc3RhcnQsIDEpXG4gIC8vICAgICB9LCBVU0VSX0NIQU5HRV9TSUdOQUwpXG4gIC8vICAgfVxuICAvL1xuICAvLyAgIGlmIChmb2N1c05vZGUgPT09IGFjdGl2ZUVsZW1lbnQpIHtcbiAgLy8gICAgIGNvbnN0IG5leHRFbGVtZW50ID0gYWN0aXZlRWxlbWVudC5jaGlsZHJlbltmb2N1c09mZnNldF1cbiAgLy9cbiAgLy8gICAgIGlmIChuZXh0RWxlbWVudCBpbnN0YW5jZW9mIEhUTUxFbGVtZW50ICYmIGlzRW1iZWRFbGVtZW50KG5leHRFbGVtZW50KSkge1xuICAvLyAgICAgICByZXR1cm4gZGVsZXRlTmV4dEVsZShuZXh0RWxlbWVudClcbiAgLy8gICAgIH1cbiAgLy9cbiAgLy8gICAgIHNldEN1cnNvckJlZm9yZShuZXh0RWxlbWVudCwgc2VsZWN0aW9uKVxuICAvLyAgIH1cbiAgLy9cbiAgLy8gICBpZiAoIWZvY3VzTm9kZT8udGV4dENvbnRlbnQgfHwgZm9jdXNPZmZzZXQgPT09IGZvY3VzTm9kZS50ZXh0Q29udGVudC5sZW5ndGgpIHtcbiAgLy8gICAgIGNvbnN0IHBhcmVudE5vZGUgPSBmb2N1c05vZGUhLnBhcmVudEVsZW1lbnQhXG4gIC8vICAgICBjb25zdCBuZXh0Tm9kZSA9IHBhcmVudE5vZGUgPT09IGFjdGl2ZUVsZW1lbnQgPyBmb2N1c05vZGUhLm5leHRTaWJsaW5nIDogcGFyZW50Tm9kZS5uZXh0U2libGluZ1xuICAvL1xuICAvLyAgICAgaWYgKG5leHROb2RlICYmIGlzRW1iZWRFbGVtZW50KG5leHROb2RlKSkge1xuICAvLyAgICAgICByZXR1cm4gZGVsZXRlTmV4dEVsZSg8SFRNTEVsZW1lbnQ+bmV4dE5vZGUpXG4gIC8vICAgICB9XG4gIC8vXG4gIC8vICAgICBuZXh0Tm9kZSAmJiBzZXRDdXJzb3JCZWZvcmUobmV4dE5vZGUsIHNlbGVjdGlvbilcbiAgLy8gICB9XG4gIC8vXG4gIC8vICAgY29udHJvbGxlci50cmFuc2FjdCgoKSA9PiB7XG4gIC8vICAgICBjb25zdCB7Zm9jdXNOb2RlLCBmb2N1c09mZnNldH0gPSBzZWxlY3Rpb247XG4gIC8vXG4gIC8vICAgICBzZWxlY3Rpb24ubW9kaWZ5KCdtb3ZlJywgJ2ZvcndhcmQnLCAnY2hhcmFjdGVyJylcbiAgLy8gICAgIGNvbnN0IHRleHROb2RlID0gZm9jdXNOb2RlIGFzIFRleHRcbiAgLy8gICAgIHRleHROb2RlLmRlbGV0ZURhdGEoZm9jdXNPZmZzZXQsIDEpO1xuICAvLyAgICAgeVRleHQuZGVsZXRlKGJsb2NrUmFuZ2Uuc3RhcnQsIDEpXG4gIC8vXG4gIC8vICAgICBpZiAoIXRleHROb2RlLmxlbmd0aCkge1xuICAvLyAgICAgICBjb25zdCBwYXJlbnROb2RlID0gdGV4dE5vZGUucGFyZW50RWxlbWVudCFcbiAgLy9cbiAgLy8gICAgICAgaWYgKHBhcmVudE5vZGUgPT09IGFjdGl2ZUVsZW1lbnQpIHtcbiAgLy8gICAgICAgICB0ZXh0Tm9kZS5yZW1vdmUoKVxuICAvLyAgICAgICAgIHJldHVyblxuICAvLyAgICAgICB9XG4gIC8vXG4gIC8vICAgICAgIGNvbnN0IHByZXZOb2RlID0gcGFyZW50Tm9kZS5uZXh0U2libGluZyFcbiAgLy8gICAgICAgcGFyZW50Tm9kZS5yZW1vdmUoKVxuICAvLyAgICAgICBzZXRDdXJzb3JCZWZvcmUocHJldk5vZGUsIHNlbGVjdGlvbilcbiAgLy8gICAgIH1cbiAgLy9cbiAgLy8gICB9LCBVU0VSX0NIQU5HRV9TSUdOQUwpXG4gIC8vICAgcmV0dXJuO1xuICAvLyB9XG4gIC8vXG4gIC8vIGNvbnN0IGRlbHRhcyA9IFtcbiAgLy8gICB7cmV0YWluOiBibG9ja1JhbmdlLnN0YXJ0fSxcbiAgLy8gICB7ZGVsZXRlOiBibG9ja1JhbmdlLmVuZCAtIGJsb2NrUmFuZ2Uuc3RhcnR9LFxuICAvLyBdXG4gIC8vIGFkanVzdFJhbmdlRWRnZXMoYlJlZi5jb250YWluZXJFbGUsIHNlbGVjdGlvbi5nZXRSYW5nZUF0KDApKVxuICAvLyBzZWxlY3Rpb24uY29sbGFwc2VUb0VuZCgpXG4gIC8vIGJSZWYuYXBwbHlEZWx0YShkZWx0YXMpXG59XG4iXX0=