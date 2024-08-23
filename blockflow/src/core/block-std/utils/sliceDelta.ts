import {DeltaInsert} from "@core";

export const sliceDelta = (delta: DeltaInsert[], from: number, to?: number) => {

  const findPath = (delta: DeltaInsert[], pos: number) => {
    let i = 0, cnt = 0
    while (cnt + delta[i].insert.length < pos) {
      cnt += delta[i].insert.length
      i++
    }
    return [i, pos - cnt]
  }

  const [fromPath, fromIndex] = findPath(delta, from)
  const [toPath, toIndex] = to ? findPath(delta, to) : [delta.length - 1, delta[delta.length - 1].insert.length]
  const _slice: DeltaInsert[] = []
  for (let i = fromPath; i <= toPath; i++) {
    const d = JSON.parse(JSON.stringify(delta[i]))
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



