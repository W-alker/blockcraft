import {filter, fromEvent, Subscription, take} from "rxjs";
import {
  BlockflowInline, ClipDataWriter,
  Controller,
  EditableBlock,
  IInlineAttrs,
  IPlugin
} from "../../core";
import {FloatToolbar, IToolbarItem} from "../../components";
import {Overlay} from "@angular/cdk/overlay";
import {ComponentPortal} from "@angular/cdk/portal";
import {InlineLinkBlockFloatDialog} from "./widget/float-edit-dialog";

const TOOLBAR_LIST: IToolbarItem[] = [
  {
    icon: 'bf_icon bf_open-link',
    text: '打开',
    title: '打开链接',
    name: 'open',
  },
  {
    name: '|',
  },
  {
    icon: 'bf_icon bf_bianji_1',
    title: '编辑',
    name: 'edit',
  },
  {
    icon: 'bf_icon bf_fuzhi',
    title: '复制',
    name: 'copy',
  },
  {
    icon: 'bf_icon bf_jiebang',
    title: '解除链接',
    name: 'unlink',
  },
]

export class InlineLinkPlugin implements IPlugin {
  name = 'inline-link';
  version = 1.0;

  subscribe!: Subscription;

  init(c: Controller) {
    const overlay = c.injector.get(Overlay)

    const createOverlay = (target: HTMLElement) => {
      const position = overlay.position().flexibleConnectedTo(target).withPositions([{
        originX: 'center', originY: 'bottom', overlayX: 'center', overlayY: 'top',}])
      const ref =  overlay.create({
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
      const attrs = BlockflowInline.getAttributes(target)

      const ref = createOverlay(target)
      const portal = new ComponentPortal(InlineLinkBlockFloatDialog)
      const cpr = ref.attach(portal)
      cpr.setInput('attrs', attrs)

      cpr.instance.close
        .pipe(take(1))
        .subscribe(() => {
          ref.dispose()
        })

      cpr.instance.update
        .pipe(take(1))
        .subscribe(v => {
          const newAttrs: IInlineAttrs = {}
          for(let key in v) {
            // @ts-ignore
            if(v[key] && attrs[key] !== v[key]) {
              // @ts-ignore
              newAttrs[key] = v[key]
            }
          }
          if(Object.keys(newAttrs).length === 0) return
          const {activeBlock, start} = getActiveBlockAndPos(target)
          activeBlock.applyDelta([
            {
              retain: start,
            },
            {
              retain: 1,
              attributes: newAttrs
            }
          ])
          ref.dispose()
        })
    }

    const getActiveBlockAndPos = (target: HTMLElement) => {
      const activeBlockId = target.closest('[bf-node-type]')!.id
      const activeBlock = c.getBlockRef(activeBlockId) as EditableBlock
      const range = document.createRange()
      range.setStart(activeBlock.containerEle, 0)
      range.setEndBefore(target)
      const len = range.toString().length
      range.detach()
      return {activeBlock, start: len}
    }

    this.subscribe = fromEvent<MouseEvent>(c.rootElement, 'click')
      .pipe(filter(e => (e.target as HTMLElement).getAttribute('bf-embed') === 'link'))
      .subscribe((e) => {
        const target = e.target as HTMLElement
        const ref = createOverlay(target)

        const portal = new ComponentPortal(FloatToolbar)
        const cpr = ref.attach(portal)
        cpr.instance.toolbarList = TOOLBAR_LIST
        cpr.instance.itemClick.subscribe((item) => {
          if (c.readonly$.value && item.name !== 'open') return
          switch (item.name) {
            case 'open':
              window.open(target.getAttribute('data-link-href')!)
              break
            case 'edit':
              openDialog(target)
              break
            case 'copy':
              const delta = BlockflowInline.elementToDelta(target)
              ClipDataWriter.writeDeltaToClipboard([delta])
              break
            case 'unlink':
              const text = target.getAttribute('data-link-text')!
              const {activeBlock, start} = getActiveBlockAndPos(target)
              activeBlock.applyDelta([
                {
                  retain: start,
                },
                {
                  delete: 1,
                },
                {
                  insert: text,
                }
              ])
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
