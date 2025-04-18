import {DeltaInsert} from "../../types";

export const deltaToString = (delta: DeltaInsert[]) => {
  return delta.reduce((acc, cur) => acc + (typeof cur.insert === "string" ? cur.insert : ''), '')
}
