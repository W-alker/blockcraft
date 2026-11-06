import {createBlockShell} from '../dom/create-block-shell'
import {SnapshotBlockRenderer} from '../types'

export function createPageDividerRenderer(): SnapshotBlockRenderer {
  return {
    canRender: snapshot => snapshot.flavour === 'page-divider',
    render(_ctx, snapshot) {
      const element = createBlockShell(snapshot)
      const inner = document.createElement('div')
      inner.className = 'page-divider-inner'
      inner.contentEditable = 'false'
      const before = document.createElement('span')
      before.className = 'page-divider-seg'
      const label = document.createElement('span')
      label.className = 'page-divider-label'
      const icon = document.createElement('i')
      icon.className = 'bc_icon bc_fenyefu'
      label.append(icon, document.createTextNode('分页符'))
      const after = document.createElement('span')
      after.className = 'page-divider-seg'
      inner.append(before, label, after)
      element.append(inner)
      return {element}
    },
  }
}
