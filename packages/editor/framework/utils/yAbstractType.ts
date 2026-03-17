import * as Y from 'yjs'

export function isYArray(obj: Y.AbstractType<any>): obj is Y.Array<any> {
  // @ts-ignore
  return obj.constructor.name === 'YArray' || obj.constructor.name === '_YArray' || typeof obj['toArray'] === 'function'
}

export function isYText(obj: Y.AbstractType<any>): obj is Y.Text {
  // @ts-ignore
  return obj.constructor.name === 'YText' || obj.constructor.name === '_YText' || typeof obj['toDelta'] === 'function'
}
