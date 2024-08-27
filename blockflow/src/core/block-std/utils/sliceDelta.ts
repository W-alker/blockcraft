import {DeltaInsert} from "@core";

export const sliceDelta = (deltas: DeltaInsert[], from: number, to?: number) => {
  const _delta = JSON.parse(JSON.stringify(deltas))

  const findPath = (delta: DeltaInsert[], pos: number) => {
    let i = 0, cnt = 0
    if(delta[0].insert.length >= pos) return [0, pos]
    for(let d of delta) {
      cnt += d.insert.length
      if (cnt >= pos) break
      i++
    }
    return [i, pos - cnt]
  }

  const [fromPath, fromIndex] = findPath(_delta, from)
  const [toPath, toIndex] = to ? findPath(_delta, to) : [_delta.length - 1, _delta[_delta.length - 1].insert.length]
  console.log('fromPath', fromPath, 'fromIndex', fromIndex, 'toPath', toPath, 'toIndex', toIndex)
  const _slice: DeltaInsert[] = []
  for (let i = fromPath; i <= toPath; i++) {
    const d = JSON.parse(JSON.stringify(_delta[i]))
    if (i === fromPath) {
      d.insert = d.insert.slice(fromIndex)
    } else if (i === toPath) {
      d.insert = d.insert.slice(0, toIndex)
    }
    _slice.push(d)
  }

  return _slice.filter(d => d.insert.length > 0)
}

export default sliceDelta



