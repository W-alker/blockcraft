import {BlockNodeType, IBlockSnapshot} from "../block-std";
import {generateId} from "./id";
import {deltaToString} from "../../global";

export const replaceSnapshotsIdDeeply = (snapshots: IBlockSnapshot[]) => {
  snapshots.forEach(v => {
    v.id = generateId()

    if ((v.nodeType === BlockNodeType.root || v.nodeType === BlockNodeType.block) && v.children.length) {
      replaceSnapshotsIdDeeply(v.children)
    }
  })
}

export const replaceSnapshotsDepths = (snapshots: IBlockSnapshot[], startDepth: number) => {
  snapshots.forEach(v => {
    v.props.depth = startDepth
  })
}

export const snapshots2Text = (snapshots: IBlockSnapshot[]) => {
  let str = ''

  const append = (snapshot: IBlockSnapshot) => {
    if (snapshot.nodeType === 'editable') {
      str += deltaToString(snapshot.children)
    }

    if (snapshot.nodeType === 'block' || snapshot.nodeType === 'root') {
      snapshot.children.forEach(append)
    }
  }

  snapshots.forEach(append)
  return str
}
