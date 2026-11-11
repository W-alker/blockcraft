// 文本分行只依赖标准换行符，不加载编辑器的 Inline 常量模块。
const STR_LINE_BREAK = '\n';

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
