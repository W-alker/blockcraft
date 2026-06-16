// 直连 inline 常量叶子，勿经 `../../framework` barrel —— 否则 global(最底层) 反向拖入整个 framework
// (modules/chain/各 block 子类)，使 BaseBlockComponent 被打包到子类之后 → 启动 TDZ 崩溃。
import {STR_LINE_BREAK} from "../../framework/block-std/inline/const";

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
