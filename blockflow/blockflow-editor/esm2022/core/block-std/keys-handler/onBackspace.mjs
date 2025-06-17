import { USER_CHANGE_SIGNAL } from "../../yjs";
export const onBackspace = (e, controller) => {
    const curRange = controller.selection.getSelection();
    if (curRange.isAtRoot) {
        e.preventDefault();
        const res = controller.deleteSelectedBlocks();
        if (!res || res[0] === 0)
            return;
        // 聚焦上一个块
        const prev = controller.rootModel[res[0] - 1];
        controller.selection.focusTo(prev.id, 'end');
        return;
    }
    const { blockId, blockRange } = curRange;
    const bRef = controller.getBlockRef(blockId);
    if (blockRange.start === 0 && blockRange.end === 0) {
        e.preventDefault();
        // transform to paragraph
        if (bRef.flavour !== 'paragraph') {
            const pBlock = controller.createBlock('paragraph', [bRef.getTextDelta(), bRef.props]);
            controller.replaceWith(bRef.id, [pBlock]).then(() => {
                controller.selection.setSelection(pBlock.id, 'start');
            });
            return;
        }
        // decrement indent
        if (bRef.props.indent > 0) {
            bRef.setProp('indent', bRef.props.indent - 1);
            return;
        }
        const position = bRef.getPosition();
        if (position.parentId !== controller.rootId || position.index === 0)
            return;
        const prevBlock = controller.getBlockRef(controller.rootModel[position.index - 1].id);
        if (!prevBlock)
            throw new Error(`Can not find prev block`);
        if (!controller.isEditableBlock(prevBlock)) {
            if (!bRef.textLength) {
                controller.deleteBlocks(position.index, 1);
            }
            controller.selection.setSelection(controller.rootId, position.index - 1, position.index);
            return;
        }
        const deltas = bRef.textLength ? [{ retain: prevBlock.textLength }, ...bRef.getTextDelta()] : [];
        controller.transact(() => {
            prevBlock.setSelection('end');
            deltas.length && prevBlock.applyDelta(deltas, false);
            controller.deleteBlockById(bRef.id);
        }, USER_CHANGE_SIGNAL);
        return;
    }
    // const activeElement = bRef.containerEle
    // const yText = bRef.yText
    // const selection = window.getSelection()!
    //
    // if (selection.isCollapsed) {
    //   const {focusNode, focusOffset} = selection
    //
    //   // delete prev element and focus to prev node before it
    //   const deletePrevEle = (prevEle: Element) => {
    //     controller.transact(() => {
    //       prevEle.remove()
    //       yText.delete(blockRange.start - 1, 1)
    //     }, USER_CHANGE_SIGNAL)
    //   }
    //
    //   if (focusNode === activeElement) {
    //     const prevNode = activeElement.childNodes[focusOffset - 1]
    //
    //     // if prev element is embed element, delete it
    //     if (prevNode instanceof Element && isEmbedElement(prevNode)) {
    //       return deletePrevEle(prevNode)
    //     }
    //
    //     // if prev element is not embed element, focus to it end
    //     setCursorAfter(prevNode, selection)
    //   }
    //
    //   // if focusNode is text node
    //   if (focusOffset === 0) {
    //     const parentNode = focusNode!.parentElement!
    //     const prevNode = parentNode === activeElement ? focusNode!.previousSibling! : parentNode.previousSibling!
    //
    //     if (isEmbedElement(prevNode)) {
    //       return deletePrevEle(<HTMLElement>prevNode)
    //     }
    //
    //     setCursorAfter(prevNode, selection)
    //   }
    //
    //   // default, handle it as text node
    //   controller.transact(() => {
    //     // TODO bug
    //     const {focusNode, focusOffset} = selection;
    //
    //     selection.modify('move', 'backward', 'character')
    //     const textNode = focusNode as Text
    //     textNode.deleteData(focusOffset - 1, 1);
    //     yText.delete(blockRange.start - 1, 1)
    //
    //     if (textNode.length === 0) {
    //       const parentNode = textNode.parentElement!
    //       if (parentNode === activeElement) {
    //         textNode.remove()
    //         return
    //       }
    //       // const prevNode = parentNode.previousSibling!
    //       // parentNode.remove()
    //       // setCursorAfter(prevNode, selection)
    //     }
    //
    //   }, USER_CHANGE_SIGNAL)
    //
    //   return
    // }
    //
    // const deltas = [
    //   {retain: blockRange.start},
    //   {delete: blockRange.end - blockRange.start},
    // ]
    // adjustRangeEdges(bRef.containerEle, selection.getRangeAt(0))
    // selection.collapseToStart()
    // bRef.applyDelta(deltas, false)
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib25CYWNrc3BhY2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi9ibG9ja2Zsb3cvc3JjL2NvcmUvYmxvY2stc3RkL2tleXMtaGFuZGxlci9vbkJhY2tzcGFjZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFFQSxPQUFPLEVBQUMsa0JBQWtCLEVBQUMsTUFBTSxXQUFXLENBQUM7QUFHN0MsTUFBTSxDQUFDLE1BQU0sV0FBVyxHQUFxQixDQUFDLENBQUMsRUFBRSxVQUFVLEVBQUUsRUFBRTtJQUU3RCxNQUFNLFFBQVEsR0FBRyxVQUFVLENBQUMsU0FBUyxDQUFDLFlBQVksRUFBRyxDQUFBO0lBQ3JELElBQUksUUFBUSxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQ3RCLENBQUMsQ0FBQyxjQUFjLEVBQUUsQ0FBQTtRQUVsQixNQUFNLEdBQUcsR0FBRyxVQUFVLENBQUMsb0JBQW9CLEVBQUUsQ0FBQTtRQUM3QyxJQUFJLENBQUMsR0FBRyxJQUFJLEdBQUcsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDO1lBQUUsT0FBTTtRQUNoQyxTQUFTO1FBQ1QsTUFBTSxJQUFJLEdBQUcsVUFBVSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUE7UUFDN0MsVUFBVSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQTtRQUM1QyxPQUFNO0lBQ1IsQ0FBQztJQUVELE1BQU0sRUFBQyxPQUFPLEVBQUUsVUFBVSxFQUFDLEdBQUcsUUFBUSxDQUFBO0lBQ3RDLE1BQU0sSUFBSSxHQUFHLFVBQVUsQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFrQixDQUFBO0lBRTdELElBQUksVUFBVSxDQUFDLEtBQUssS0FBSyxDQUFDLElBQUksVUFBVSxDQUFDLEdBQUcsS0FBSyxDQUFDLEVBQUUsQ0FBQztRQUNuRCxDQUFDLENBQUMsY0FBYyxFQUFFLENBQUE7UUFFbEIseUJBQXlCO1FBQ3pCLElBQUksSUFBSSxDQUFDLE9BQU8sS0FBSyxXQUFXLEVBQUUsQ0FBQztZQUNqQyxNQUFNLE1BQU0sR0FBRyxVQUFVLENBQUMsV0FBVyxDQUFDLFdBQVcsRUFBRSxDQUFDLElBQUksQ0FBQyxZQUFZLEVBQUUsRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQTtZQUNyRixVQUFVLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxFQUFFLEVBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUU7Z0JBQ2xELFVBQVUsQ0FBQyxTQUFTLENBQUMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxFQUFFLEVBQUUsT0FBTyxDQUFDLENBQUE7WUFDdkQsQ0FBQyxDQUFDLENBQUE7WUFDRixPQUFPO1FBQ1QsQ0FBQztRQUVELG1CQUFtQjtRQUNuQixJQUFJLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQzFCLElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFBO1lBQzdDLE9BQU07UUFDUixDQUFDO1FBRUQsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFBO1FBQ25DLElBQUksUUFBUSxDQUFDLFFBQVEsS0FBSyxVQUFVLENBQUMsTUFBTSxJQUFJLFFBQVEsQ0FBQyxLQUFLLEtBQUssQ0FBQztZQUFFLE9BQU07UUFDM0UsTUFBTSxTQUFTLEdBQUcsVUFBVSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUE7UUFDckYsSUFBSSxDQUFDLFNBQVM7WUFBRSxNQUFNLElBQUksS0FBSyxDQUFDLHlCQUF5QixDQUFDLENBQUE7UUFFMUQsSUFBSSxDQUFDLFVBQVUsQ0FBQyxlQUFlLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQztZQUMzQyxJQUFHLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO2dCQUNwQixVQUFVLENBQUMsWUFBWSxDQUFDLFFBQVEsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUE7WUFDNUMsQ0FBQztZQUNELFVBQVUsQ0FBQyxTQUFTLENBQUMsWUFBWSxDQUFDLFVBQVUsQ0FBQyxNQUFNLEVBQUUsUUFBUSxDQUFDLEtBQUssR0FBRyxDQUFDLEVBQUUsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFBO1lBQ3hGLE9BQU07UUFDUixDQUFDO1FBRUQsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFDLE1BQU0sRUFBRSxTQUFTLENBQUMsVUFBVSxFQUFDLEVBQUUsR0FBRyxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFBO1FBQzlGLFVBQVUsQ0FBQyxRQUFRLENBQUMsR0FBRyxFQUFFO1lBQ3ZCLFNBQVMsQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLENBQUE7WUFDN0IsTUFBTSxDQUFDLE1BQU0sSUFBSSxTQUFTLENBQUMsVUFBVSxDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUMsQ0FBQTtZQUNwRCxVQUFVLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQTtRQUNyQyxDQUFDLEVBQUUsa0JBQWtCLENBQUMsQ0FBQTtRQUN0QixPQUFNO0lBQ1IsQ0FBQztJQUVELDBDQUEwQztJQUMxQywyQkFBMkI7SUFDM0IsMkNBQTJDO0lBQzNDLEVBQUU7SUFDRiwrQkFBK0I7SUFDL0IsK0NBQStDO0lBQy9DLEVBQUU7SUFDRiw0REFBNEQ7SUFDNUQsa0RBQWtEO0lBQ2xELGtDQUFrQztJQUNsQyx5QkFBeUI7SUFDekIsOENBQThDO0lBQzlDLDZCQUE2QjtJQUM3QixNQUFNO0lBQ04sRUFBRTtJQUNGLHVDQUF1QztJQUN2QyxpRUFBaUU7SUFDakUsRUFBRTtJQUNGLHFEQUFxRDtJQUNyRCxxRUFBcUU7SUFDckUsdUNBQXVDO0lBQ3ZDLFFBQVE7SUFDUixFQUFFO0lBQ0YsK0RBQStEO0lBQy9ELDBDQUEwQztJQUMxQyxNQUFNO0lBQ04sRUFBRTtJQUNGLGlDQUFpQztJQUNqQyw2QkFBNkI7SUFDN0IsbURBQW1EO0lBQ25ELGdIQUFnSDtJQUNoSCxFQUFFO0lBQ0Ysc0NBQXNDO0lBQ3RDLG9EQUFvRDtJQUNwRCxRQUFRO0lBQ1IsRUFBRTtJQUNGLDBDQUEwQztJQUMxQyxNQUFNO0lBQ04sRUFBRTtJQUNGLHVDQUF1QztJQUN2QyxnQ0FBZ0M7SUFDaEMsa0JBQWtCO0lBQ2xCLGtEQUFrRDtJQUNsRCxFQUFFO0lBQ0Ysd0RBQXdEO0lBQ3hELHlDQUF5QztJQUN6QywrQ0FBK0M7SUFDL0MsNENBQTRDO0lBQzVDLEVBQUU7SUFDRixtQ0FBbUM7SUFDbkMsbURBQW1EO0lBQ25ELDRDQUE0QztJQUM1Qyw0QkFBNEI7SUFDNUIsaUJBQWlCO0lBQ2pCLFVBQVU7SUFDVix3REFBd0Q7SUFDeEQsK0JBQStCO0lBQy9CLCtDQUErQztJQUMvQyxRQUFRO0lBQ1IsRUFBRTtJQUNGLDJCQUEyQjtJQUMzQixFQUFFO0lBQ0YsV0FBVztJQUNYLElBQUk7SUFDSixFQUFFO0lBQ0YsbUJBQW1CO0lBQ25CLGdDQUFnQztJQUNoQyxpREFBaUQ7SUFDakQsSUFBSTtJQUNKLCtEQUErRDtJQUMvRCw4QkFBOEI7SUFDOUIsaUNBQWlDO0FBQ25DLENBQUMsQ0FBQSIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7SUtleUV2ZW50SGFuZGxlcn0gZnJvbSBcIi4va2V5RXZlbnRCdXNcIjtcbmltcG9ydCB7RWRpdGFibGVCbG9ja30gZnJvbSBcIi4uL2NvbXBvbmVudHNcIjtcbmltcG9ydCB7VVNFUl9DSEFOR0VfU0lHTkFMfSBmcm9tIFwiLi4vLi4veWpzXCI7XG5pbXBvcnQge2FkanVzdFJhbmdlRWRnZXMsIGlzRW1iZWRFbGVtZW50LCBzZXRDdXJzb3JBZnRlcn0gZnJvbSBcIi4uLy4uL3V0aWxzXCI7XG5cbmV4cG9ydCBjb25zdCBvbkJhY2tzcGFjZTogSUtleUV2ZW50SGFuZGxlciA9IChlLCBjb250cm9sbGVyKSA9PiB7XG5cbiAgY29uc3QgY3VyUmFuZ2UgPSBjb250cm9sbGVyLnNlbGVjdGlvbi5nZXRTZWxlY3Rpb24oKSFcbiAgaWYgKGN1clJhbmdlLmlzQXRSb290KSB7XG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpXG5cbiAgICBjb25zdCByZXMgPSBjb250cm9sbGVyLmRlbGV0ZVNlbGVjdGVkQmxvY2tzKClcbiAgICBpZiAoIXJlcyB8fCByZXNbMF0gPT09IDApIHJldHVyblxuICAgIC8vIOiBmueEpuS4iuS4gOS4quWdl1xuICAgIGNvbnN0IHByZXYgPSBjb250cm9sbGVyLnJvb3RNb2RlbFtyZXNbMF0gLSAxXVxuICAgIGNvbnRyb2xsZXIuc2VsZWN0aW9uLmZvY3VzVG8ocHJldi5pZCwgJ2VuZCcpXG4gICAgcmV0dXJuXG4gIH1cblxuICBjb25zdCB7YmxvY2tJZCwgYmxvY2tSYW5nZX0gPSBjdXJSYW5nZVxuICBjb25zdCBiUmVmID0gY29udHJvbGxlci5nZXRCbG9ja1JlZihibG9ja0lkKSBhcyBFZGl0YWJsZUJsb2NrXG5cbiAgaWYgKGJsb2NrUmFuZ2Uuc3RhcnQgPT09IDAgJiYgYmxvY2tSYW5nZS5lbmQgPT09IDApIHtcbiAgICBlLnByZXZlbnREZWZhdWx0KClcblxuICAgIC8vIHRyYW5zZm9ybSB0byBwYXJhZ3JhcGhcbiAgICBpZiAoYlJlZi5mbGF2b3VyICE9PSAncGFyYWdyYXBoJykge1xuICAgICAgY29uc3QgcEJsb2NrID0gY29udHJvbGxlci5jcmVhdGVCbG9jaygncGFyYWdyYXBoJywgW2JSZWYuZ2V0VGV4dERlbHRhKCksIGJSZWYucHJvcHNdKVxuICAgICAgY29udHJvbGxlci5yZXBsYWNlV2l0aChiUmVmLmlkLCBbcEJsb2NrXSkudGhlbigoKSA9PiB7XG4gICAgICAgIGNvbnRyb2xsZXIuc2VsZWN0aW9uLnNldFNlbGVjdGlvbihwQmxvY2suaWQsICdzdGFydCcpXG4gICAgICB9KVxuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIGRlY3JlbWVudCBpbmRlbnRcbiAgICBpZiAoYlJlZi5wcm9wcy5pbmRlbnQgPiAwKSB7XG4gICAgICBiUmVmLnNldFByb3AoJ2luZGVudCcsIGJSZWYucHJvcHMuaW5kZW50IC0gMSlcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIGNvbnN0IHBvc2l0aW9uID0gYlJlZi5nZXRQb3NpdGlvbigpXG4gICAgaWYgKHBvc2l0aW9uLnBhcmVudElkICE9PSBjb250cm9sbGVyLnJvb3RJZCB8fCBwb3NpdGlvbi5pbmRleCA9PT0gMCkgcmV0dXJuXG4gICAgY29uc3QgcHJldkJsb2NrID0gY29udHJvbGxlci5nZXRCbG9ja1JlZihjb250cm9sbGVyLnJvb3RNb2RlbFtwb3NpdGlvbi5pbmRleCAtIDFdLmlkKVxuICAgIGlmICghcHJldkJsb2NrKSB0aHJvdyBuZXcgRXJyb3IoYENhbiBub3QgZmluZCBwcmV2IGJsb2NrYClcblxuICAgIGlmICghY29udHJvbGxlci5pc0VkaXRhYmxlQmxvY2socHJldkJsb2NrKSkge1xuICAgICAgaWYoIWJSZWYudGV4dExlbmd0aCkge1xuICAgICAgICBjb250cm9sbGVyLmRlbGV0ZUJsb2Nrcyhwb3NpdGlvbi5pbmRleCwgMSlcbiAgICAgIH1cbiAgICAgIGNvbnRyb2xsZXIuc2VsZWN0aW9uLnNldFNlbGVjdGlvbihjb250cm9sbGVyLnJvb3RJZCwgcG9zaXRpb24uaW5kZXggLSAxLCBwb3NpdGlvbi5pbmRleClcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIGNvbnN0IGRlbHRhcyA9IGJSZWYudGV4dExlbmd0aCA/IFt7cmV0YWluOiBwcmV2QmxvY2sudGV4dExlbmd0aH0sIC4uLmJSZWYuZ2V0VGV4dERlbHRhKCldIDogW11cbiAgICBjb250cm9sbGVyLnRyYW5zYWN0KCgpID0+IHtcbiAgICAgIHByZXZCbG9jay5zZXRTZWxlY3Rpb24oJ2VuZCcpXG4gICAgICBkZWx0YXMubGVuZ3RoICYmIHByZXZCbG9jay5hcHBseURlbHRhKGRlbHRhcywgZmFsc2UpXG4gICAgICBjb250cm9sbGVyLmRlbGV0ZUJsb2NrQnlJZChiUmVmLmlkKVxuICAgIH0sIFVTRVJfQ0hBTkdFX1NJR05BTClcbiAgICByZXR1cm5cbiAgfVxuXG4gIC8vIGNvbnN0IGFjdGl2ZUVsZW1lbnQgPSBiUmVmLmNvbnRhaW5lckVsZVxuICAvLyBjb25zdCB5VGV4dCA9IGJSZWYueVRleHRcbiAgLy8gY29uc3Qgc2VsZWN0aW9uID0gd2luZG93LmdldFNlbGVjdGlvbigpIVxuICAvL1xuICAvLyBpZiAoc2VsZWN0aW9uLmlzQ29sbGFwc2VkKSB7XG4gIC8vICAgY29uc3Qge2ZvY3VzTm9kZSwgZm9jdXNPZmZzZXR9ID0gc2VsZWN0aW9uXG4gIC8vXG4gIC8vICAgLy8gZGVsZXRlIHByZXYgZWxlbWVudCBhbmQgZm9jdXMgdG8gcHJldiBub2RlIGJlZm9yZSBpdFxuICAvLyAgIGNvbnN0IGRlbGV0ZVByZXZFbGUgPSAocHJldkVsZTogRWxlbWVudCkgPT4ge1xuICAvLyAgICAgY29udHJvbGxlci50cmFuc2FjdCgoKSA9PiB7XG4gIC8vICAgICAgIHByZXZFbGUucmVtb3ZlKClcbiAgLy8gICAgICAgeVRleHQuZGVsZXRlKGJsb2NrUmFuZ2Uuc3RhcnQgLSAxLCAxKVxuICAvLyAgICAgfSwgVVNFUl9DSEFOR0VfU0lHTkFMKVxuICAvLyAgIH1cbiAgLy9cbiAgLy8gICBpZiAoZm9jdXNOb2RlID09PSBhY3RpdmVFbGVtZW50KSB7XG4gIC8vICAgICBjb25zdCBwcmV2Tm9kZSA9IGFjdGl2ZUVsZW1lbnQuY2hpbGROb2Rlc1tmb2N1c09mZnNldCAtIDFdXG4gIC8vXG4gIC8vICAgICAvLyBpZiBwcmV2IGVsZW1lbnQgaXMgZW1iZWQgZWxlbWVudCwgZGVsZXRlIGl0XG4gIC8vICAgICBpZiAocHJldk5vZGUgaW5zdGFuY2VvZiBFbGVtZW50ICYmIGlzRW1iZWRFbGVtZW50KHByZXZOb2RlKSkge1xuICAvLyAgICAgICByZXR1cm4gZGVsZXRlUHJldkVsZShwcmV2Tm9kZSlcbiAgLy8gICAgIH1cbiAgLy9cbiAgLy8gICAgIC8vIGlmIHByZXYgZWxlbWVudCBpcyBub3QgZW1iZWQgZWxlbWVudCwgZm9jdXMgdG8gaXQgZW5kXG4gIC8vICAgICBzZXRDdXJzb3JBZnRlcihwcmV2Tm9kZSwgc2VsZWN0aW9uKVxuICAvLyAgIH1cbiAgLy9cbiAgLy8gICAvLyBpZiBmb2N1c05vZGUgaXMgdGV4dCBub2RlXG4gIC8vICAgaWYgKGZvY3VzT2Zmc2V0ID09PSAwKSB7XG4gIC8vICAgICBjb25zdCBwYXJlbnROb2RlID0gZm9jdXNOb2RlIS5wYXJlbnRFbGVtZW50IVxuICAvLyAgICAgY29uc3QgcHJldk5vZGUgPSBwYXJlbnROb2RlID09PSBhY3RpdmVFbGVtZW50ID8gZm9jdXNOb2RlIS5wcmV2aW91c1NpYmxpbmchIDogcGFyZW50Tm9kZS5wcmV2aW91c1NpYmxpbmchXG4gIC8vXG4gIC8vICAgICBpZiAoaXNFbWJlZEVsZW1lbnQocHJldk5vZGUpKSB7XG4gIC8vICAgICAgIHJldHVybiBkZWxldGVQcmV2RWxlKDxIVE1MRWxlbWVudD5wcmV2Tm9kZSlcbiAgLy8gICAgIH1cbiAgLy9cbiAgLy8gICAgIHNldEN1cnNvckFmdGVyKHByZXZOb2RlLCBzZWxlY3Rpb24pXG4gIC8vICAgfVxuICAvL1xuICAvLyAgIC8vIGRlZmF1bHQsIGhhbmRsZSBpdCBhcyB0ZXh0IG5vZGVcbiAgLy8gICBjb250cm9sbGVyLnRyYW5zYWN0KCgpID0+IHtcbiAgLy8gICAgIC8vIFRPRE8gYnVnXG4gIC8vICAgICBjb25zdCB7Zm9jdXNOb2RlLCBmb2N1c09mZnNldH0gPSBzZWxlY3Rpb247XG4gIC8vXG4gIC8vICAgICBzZWxlY3Rpb24ubW9kaWZ5KCdtb3ZlJywgJ2JhY2t3YXJkJywgJ2NoYXJhY3RlcicpXG4gIC8vICAgICBjb25zdCB0ZXh0Tm9kZSA9IGZvY3VzTm9kZSBhcyBUZXh0XG4gIC8vICAgICB0ZXh0Tm9kZS5kZWxldGVEYXRhKGZvY3VzT2Zmc2V0IC0gMSwgMSk7XG4gIC8vICAgICB5VGV4dC5kZWxldGUoYmxvY2tSYW5nZS5zdGFydCAtIDEsIDEpXG4gIC8vXG4gIC8vICAgICBpZiAodGV4dE5vZGUubGVuZ3RoID09PSAwKSB7XG4gIC8vICAgICAgIGNvbnN0IHBhcmVudE5vZGUgPSB0ZXh0Tm9kZS5wYXJlbnRFbGVtZW50IVxuICAvLyAgICAgICBpZiAocGFyZW50Tm9kZSA9PT0gYWN0aXZlRWxlbWVudCkge1xuICAvLyAgICAgICAgIHRleHROb2RlLnJlbW92ZSgpXG4gIC8vICAgICAgICAgcmV0dXJuXG4gIC8vICAgICAgIH1cbiAgLy8gICAgICAgLy8gY29uc3QgcHJldk5vZGUgPSBwYXJlbnROb2RlLnByZXZpb3VzU2libGluZyFcbiAgLy8gICAgICAgLy8gcGFyZW50Tm9kZS5yZW1vdmUoKVxuICAvLyAgICAgICAvLyBzZXRDdXJzb3JBZnRlcihwcmV2Tm9kZSwgc2VsZWN0aW9uKVxuICAvLyAgICAgfVxuICAvL1xuICAvLyAgIH0sIFVTRVJfQ0hBTkdFX1NJR05BTClcbiAgLy9cbiAgLy8gICByZXR1cm5cbiAgLy8gfVxuICAvL1xuICAvLyBjb25zdCBkZWx0YXMgPSBbXG4gIC8vICAge3JldGFpbjogYmxvY2tSYW5nZS5zdGFydH0sXG4gIC8vICAge2RlbGV0ZTogYmxvY2tSYW5nZS5lbmQgLSBibG9ja1JhbmdlLnN0YXJ0fSxcbiAgLy8gXVxuICAvLyBhZGp1c3RSYW5nZUVkZ2VzKGJSZWYuY29udGFpbmVyRWxlLCBzZWxlY3Rpb24uZ2V0UmFuZ2VBdCgwKSlcbiAgLy8gc2VsZWN0aW9uLmNvbGxhcHNlVG9TdGFydCgpXG4gIC8vIGJSZWYuYXBwbHlEZWx0YShkZWx0YXMsIGZhbHNlKVxufVxuXG5cblxuIl19