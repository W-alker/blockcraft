import {nanoid} from "nanoid";

export function generateId(size: number = 18) {
  return nanoid(size)
}


