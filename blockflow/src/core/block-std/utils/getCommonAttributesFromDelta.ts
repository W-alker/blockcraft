import {DeltaInsert, IInlineAttrs} from "../../types";

export const getCommonAttributesFromDelta = (delta: DeltaInsert[]) => {
  if(!delta.length) return {}
  let commonAttrs: IInlineAttrs | undefined
  for (const op of delta) {
    if(!op.attributes) return {}
    if (!commonAttrs) {
      commonAttrs = {...op.attributes}
      continue
    }
    for (const key in commonAttrs) {
      // @ts-ignore
      if (commonAttrs[key] !== op.attributes[key]) {
        // @ts-ignore
        delete commonAttrs[key]
      }
    }
  }
  return commonAttrs || {}
}
