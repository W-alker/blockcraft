import {filter, fromEvent, Subscription, take} from "rxjs";
import {
  Controller, DeltaInsertEmbed, DeltaOperation,
  EditableBlock, getElementCharacterOffset,
  IPlugin, USER_CHANGE_SIGNAL
} from "../../core";
import {FloatToolbar, IToolbarItem} from "../../components";
import {Overlay} from "@angular/cdk/overlay";
import {ComponentPortal} from "@angular/cdk/portal";
import {InlineLinkBlockFloatDialog} from "./widget/float-edit-dialog";

const TOOLBAR_OPEN_LINK: IToolbarItem = {
  id: 'open',
  icon: 'bf_icon bf_open-link',
  text: '打开',
  title: '打开链接',
  name: 'open',
  divide: true
}

const TOOLBAR_EDIT_LINK: IToolbarItem = {
  id: 'edit',
  icon: 'bf_icon bf_bianji_1',
  title: '编辑',
  name: 'edit',
}

const TOOLBAR_COPY_LINK: IToolbarItem = {
  id: 'copy',
  icon: 'bf_icon bf_fuzhi',
  title: '复制',
  name: 'copy',
}

const TOOLBAR_COPIED_LINK: IToolbarItem = {
  id: 'copied',
  icon: 'bf_icon bf_fuzhi',
  text: '已复制',
  title: '已复制',
  name: 'copied',
}

const TOOLBAR_UNBIND_LINK: IToolbarItem = {
  id: 'unlink',
  icon: 'bf_icon bf_jiebang',
  title: '解除链接',
  name: 'unlink',
}

export class InlineLinkPlugin implements IPlugin {
  name = 'inline-link';
  version = 1.0;

  subscribe!: Subscription;

  init(c: Controller) {
    const overlay = c.injector.get(Overlay)

    const createOverlay = (target: HTMLElement) => {
      const position = overlay.position().flexibleConnectedTo(target).withPositions([{
        originX: 'center', originY: 'bottom', overlayX: 'center', overlayY: 'top',
      }])
      const ref = overlay.create({
        positionStrategy: position,
        hasBackdrop: true,
        backdropClass: 'cdk-overlay-transparent-backdrop',
      })
      ref.backdropClick().pipe(take(1)).subscribe(() => {
        ref.dispose()
      })
      return ref
    }

    const openDialog = (target: HTMLElement) => {
      const text = target.textContent!
      const href = target.getAttribute('data-href')!

      const ref = createOverlay(target)
      const portal = new ComponentPortal(InlineLinkBlockFloatDialog)
      const cpr = ref.attach(portal)
      cpr.setInput('text', text)
      cpr.setInput('href', href)

      cpr.instance.close.pipe(take(1)).subscribe(() => {
        ref.dispose()
      })

      cpr.instance.update
        .pipe(take(1))
        .subscribe(v => {
          const newDelta: DeltaInsertEmbed = {
            insert: {link: v.text},
            attributes: {'d:href': v.href}
          }
          const {activeBlock, start} = getActiveBlockAndPos(target)
          const newNode = c.inlineManger.createView(newDelta)
          const deltas: DeltaOperation[] = [{delete: 1}, newDelta]
          start > 0 && deltas.unshift({retain: start})
          c.transact(() => {
            target.replaceWith(newNode)
            activeBlock.applyDeltaToModel(deltas)

            const selection = document.getSelection()!
            const _r = document.createRange()
            _r.setStartAfter(newNode)
            _r.collapse(true)
            selection.removeAllRanges()
            selection.addRange(_r)

          }, USER_CHANGE_SIGNAL)
          ref.dispose()
        })
    }

    const getActiveBlockAndPos = (target: HTMLElement) => {
      const activeBlockId = target.closest('[bf-node-type]')!.id
      const activeBlock = c.getBlockRef(activeBlockId) as EditableBlock
      return {activeBlock, start: getElementCharacterOffset(target, activeBlock.containerEle)}
    }

    this.subscribe = fromEvent<MouseEvent>(c.rootElement, 'click')
      .pipe(filter(e => (e.target as HTMLElement).getAttribute('bf-embed') === 'link'))
      .subscribe((e) => {
        e.preventDefault()
        const target = e.target as HTMLElement
        const ref = createOverlay(target)

        const portal = new ComponentPortal(FloatToolbar)
        const cpr = ref.attach(portal)

        cpr.setInput('toolbarList', c.readonly$.value ? [TOOLBAR_OPEN_LINK, TOOLBAR_COPY_LINK] : [TOOLBAR_OPEN_LINK, TOOLBAR_EDIT_LINK, TOOLBAR_COPY_LINK, TOOLBAR_UNBIND_LINK])
        cpr.instance.itemClick.subscribe(({item, event}) => {
          if (c.readonly$.value && item.name !== 'open') return
          switch (item.name) {
            case 'open':
              window.open(target.getAttribute('data-href')!)
              break
            case 'edit':
              openDialog(target)
              break
            case 'copy':
              const delta = c.inlineManger.elementToDelta(target)
              c.clipboard.writeData([
                {type: 'delta', data: [delta]},
                {type: 'text', data: delta.insert['link'] as string}
              ])
              break
            case 'unlink':
              const text = target.textContent!
              const {activeBlock, start} = getActiveBlockAndPos(target)
              activeBlock.applyDelta([{retain: start}, {delete: 1}, {insert: text}])
              break
          }

          ref.dispose()
        })
      })
  }


  destroy(): void {
    this.subscribe.unsubscribe()
  }

}
