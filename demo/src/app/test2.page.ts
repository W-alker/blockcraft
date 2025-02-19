import {Component, ElementRef, ViewChild} from "@angular/core";
import * as Y from 'yjs'

@Component({
  selector: 'app-test2',
  template: `
    <button #btn>撤回</button>
    <button #btn2>打印Model</button>
  `,
  styles: [``],
  standalone: true
})
export class Test2Page {

  @ViewChild('btn', {read: ElementRef}) btn!: ElementRef
  @ViewChild('btn2', {read: ElementRef}) btn2!: ElementRef

  doc = new Y.Doc();

  model: Record<string, any> = {}

  constructor() {
  }

  ngAfterViewInit() {
    const collect = this.doc.getMap('collect')

    const rootModel: any = {
      type: 'root',
      id: 'root',
    }
    const root = new Y.Map(Object.entries(rootModel))

    rootModel.children = ['1-1', '1-2']
    rootModel.props = {}
    const rootChildren = Y.Array.from(rootModel.children)
    const rootProps = new Y.Map()
    root.set('children', rootChildren)
    root.set('props', rootProps)

    const block1Model = {
      type: 'paragraph',
      id: '1-1',
      text: 'Hello World'
    }
    const block2 = new Y.Map(Object.entries(block1Model))
    block2.set('props', new Y.Map())
    block2.set('children', Y.Array.from([]))

    const block2Model = {
      type: 'paragraph',
      id: '1-2',
      text: 'Hello World - children2'
    }
    const block3 = new Y.Map(Object.entries(block2Model))

    collect.set('root', root)
    collect.set('1-1', block2)
    collect.set('1-2', block3)
    this.model['root'] = rootModel
    this.model['1-1'] = block2
    this.model['1-2'] = block3

    const his = new Y.UndoManager(collect)

    collect.observeDeep((e, t) => {
      console.log(e.map(ev => {
        return {
          path: ev.path,
          changes: ev.changes,
          target: ev.target
        }
      }), t)

      e.forEach(ev => {
        const {path, changes, target} = ev
        if (!path.length) {
          changes.keys.forEach((change, key) => {
            switch (change.action) {
              case 'add':
              case "update":
                this.model[key] = (collect.get(key) as Y.Array<any>).toJSON();
                break;
              case 'delete':
                delete this.model[key]
            }
          })
          return
        }

        const targetBlock = this.model[path[0]]
        if (!targetBlock) return
        const data = targetBlock[path[1]]

        if (Array.isArray(data)) {
          let r = 0
          changes.delta.forEach((d, index) => {
            const {retain, insert, delete: del} = d
            if (retain) {
              r += retain
            } else if (insert) {
              data.splice(r, 0, ...insert)
              r += insert.length
            } else {
              data.splice(r, del)
            }
          })
          return
        }

        if(typeof data === 'object') {
          changes.keys.forEach((change, key) => {
            switch (change.action) {
              case 'add':
              case "update":
                data[key] = target.get(key)
                break;
              case 'delete':
                delete data[key]
            }
          })
        }

      })
    })

    this.doc.transact(() => {
      (block2.get('props') as Y.Map<any>).set('empty', true);
      (block2.get('children') as Y.Array<any>).insert(0, [new Y.Map<unknown>()])
      // rootChildren.delete(1, 1)
      // collect.delete('1-1')
      // collect.delete('1-2')
    })

    this.btn.nativeElement.addEventListener('click', () => {
      his.undo()
    })
    this.btn2.nativeElement.addEventListener('click', () => {
      console.log(this.model)
    })

  }

}
