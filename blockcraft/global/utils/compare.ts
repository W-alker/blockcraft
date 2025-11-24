import {SimpleBasicType, SimpleValue} from "../types";

export const isSimpleTypeEqual = (a: SimpleBasicType, b: SimpleBasicType): boolean => {
  if ((!a || a === '0') && (!b || b === '0')) {
    return true
  }
  return a + '' === b + ''
}
