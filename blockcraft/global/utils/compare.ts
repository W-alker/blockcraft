import {SimpleBasicType, SimpleValue} from "../types";

export const isSimpleTypeEqual = (a: SimpleBasicType, b: SimpleBasicType): boolean => {
  if ((!a || a === '0') && (!b || b === '0')) {
    return true
  }
  return a + '' === b + ''
}

/**
 * Compare two simple value
 * @param a
 * @param b
 * @return -1 if a < b, 0 if a = b, 1 if a > b
 */
export const compareSimpleValue = (a: SimpleValue, b: SimpleValue): number => {
  if (a == undefined) {
    a = 0
  }
  if (b == undefined) {
    b = 0
  }
  if (typeof a === 'string') {
    a = Number(a)
  }
  if (typeof b === 'string') {
    b = Number(b)
  }
  if (a < b) {
    return -1
  }
  if (a > b) {
    return 1
  }
  return 0
}
