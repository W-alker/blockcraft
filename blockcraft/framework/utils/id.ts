import {nanoid} from "nanoid";

export function generateId(size?: number) {
  return nanoid(size)
}


