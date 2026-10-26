import {EventEmitter} from '@angular/core'

/** Shared rail/panel state for object-format and block-owned appearance popups. */
export class ObjectFormatPopupState<Panel extends string> {
  activePanel: Panel | null = null
  readonly panelChange = new EventEmitter<void>()

  toggle(panel: Panel): void {
    this.activePanel = this.activePanel === panel ? null : panel
    this.panelChange.emit()
  }

  close(): void {
    this.activePanel = null
    this.panelChange.emit()
  }

  changed(): void {
    this.panelChange.emit()
  }
}

export const OBJECT_FORMAT_POPUP_STYLES = `
  :host{display:block;max-width:calc(100vw - 16px)}
  .object-format{--object-format-settings-panel-width:288px;display:flex;align-items:center;gap:8px;box-sizing:border-box;width:max-content;max-width:100%;color:var(--bc-float-toolbar-item-color,#1f2937);font-size:12px}
  .object-format--left{flex-direction:row-reverse}
  .object-format__rail{display:flex;flex:0 0 auto;flex-direction:column;align-items:center;gap:4px;box-sizing:border-box;width:42px;padding:5px;border:1px solid var(--bc-float-toolbar-divider-color,#e2e8f0);border-radius:11px;background:var(--bc-float-toolbar-bg,#fff);box-shadow:var(--bc-fixed-toolbar-shadow,0 8px 24px rgba(15,23,42,.16))}
  button .bc_icon{flex:0 0 auto;font-size:16px}
  .object-format__rail button{width:32px;min-width:32px;height:32px;min-height:32px;padding:0;color:inherit}
  .object-format__rail button.active{background:var(--bc-float-toolbar-item-active-bg,#eef2ff);color:var(--bc-active-color,#4857e2);box-shadow:inset 2px 0 0 var(--bc-active-color,#4857e2)}
  .object-format--left .object-format__rail button.active{box-shadow:inset -2px 0 0 var(--bc-active-color,#4857e2)}
  .object-format__rail button .bc_icon{font-size:16px}
  .object-format__rail-divider{width:24px;height:1px;background:var(--bc-float-toolbar-divider-color,#e2e8f0)}
  .object-format__panel{display:flex;flex-direction:column;box-sizing:border-box;width:min(var(--object-format-settings-panel-width),calc(100vw - 86px));max-width:100%;max-height:min(520px,calc(100vh - 24px));padding:10px;overflow:hidden;border:1px solid var(--bc-float-toolbar-divider-color,#e2e8f0);border-radius:12px;background:var(--bc-float-toolbar-bg,#fff);box-shadow:var(--bc-fixed-toolbar-shadow,0 10px 28px rgba(15,23,42,.16))}
  .object-format__panel--compact{--object-format-settings-panel-width:228px}
  .object-format__scroll{box-sizing:border-box;min-width:0;min-height:0;max-width:100%;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain}
  .object-format__tabs{display:block;margin-bottom:8px}
  .object-format__tab-section[hidden]{display:none}
  .object-format__tab-section{padding-bottom:0;border-bottom:0}
  .object-format--anchored{position:relative;width:42px;max-width:none}
  .object-format--anchored .object-format__panel{position:absolute;top:0;right:calc(100% + 8px);max-width:none}
  .object-format--anchored.object-format--left .object-format__panel{right:auto;left:calc(100% + 8px)}
`
