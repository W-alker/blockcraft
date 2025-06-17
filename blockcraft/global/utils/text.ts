import {STR_LINE_BREAK} from "../../framework";

export const getLinesByRange = (text: string, from: number, to: number) => {
  to > text.length && (to = text.length)
  const lines = text.split(STR_LINE_BREAK).map(line => line += STR_LINE_BREAK)
  const res: {
    before: string[]
    current: string[]
    after: string[]
  } = {
    before: [],
    current: [],
    after: []
  }
  let i = 0
  let lineCnt = 0
  while (i < to) {
    i += lines[lineCnt].length
    if (i > from) {
      res.current.push(lines[lineCnt])
    } else {
      res.before.push(lines[lineCnt])
    }
    lineCnt++
  }
  res.after = lines.slice(lineCnt)
  return res
}
