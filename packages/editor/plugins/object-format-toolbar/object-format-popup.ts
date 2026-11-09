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
  .object-format{--object-format-settings-panel-width:240px;display:flex;align-items:flex-start;gap:8px;box-sizing:border-box;width:max-content;max-width:100%;color:var(--bc-float-toolbar-item-color,#1f2937);font-size:12px}
  .object-format__rail{max-height:var(--bc-floating-toolbar-content-height,none);overflow-y:auto;overscroll-behavior:contain}
  .object-format--left{flex-direction:row-reverse}
  .object-format__rail{display:flex;flex:0 0 auto;flex-direction:column;align-items:center;gap:2px;box-sizing:border-box;width:34px;padding:3px;border:1px solid var(--bc-float-toolbar-divider-color,#e2e8f0);border-radius:8px;background:var(--bc-float-toolbar-bg,#fff);box-shadow:var(--bc-fixed-toolbar-shadow,0 8px 24px rgba(15,23,42,.16))}
  button .bc_icon{flex:0 0 auto;font-size:16px}
  .object-format__rail button{width:26px;min-width:26px;height:26px;min-height:26px;padding:0;color:inherit}
  .object-format__rail button.active{background:color-mix(in srgb,var(--bc-active-color,#4857e2) 8%,transparent);color:var(--bc-active-color,#4857e2);box-shadow:none}
  .object-format__rail button .bc_icon{font-size:14px}
  .object-format__rail-divider{width:20px;height:1px;background:var(--bc-float-toolbar-divider-color,#e2e8f0)}
  .object-format__panel{--cs-sem-size-interactive-sm:24px;--cs-sem-size-interactive-xs:24px;display:flex;flex-direction:column;box-sizing:border-box;width:min(var(--object-format-settings-panel-width),calc(100vw - 78px));max-width:100%;max-height:min(520px,calc(100vh - 24px),var(--bc-floating-toolbar-content-height,520px));padding:8px;overflow:hidden;border:1px solid var(--bc-float-toolbar-divider-color,#e2e8f0);border-radius:12px;background:var(--bc-float-toolbar-bg,#fff);box-shadow:var(--bc-fixed-toolbar-shadow,0 10px 28px rgba(15,23,42,.16))}
  .object-format__panel--compact{--object-format-settings-panel-width:208px}
  .object-format__scroll{box-sizing:border-box;min-width:0;min-height:0;max-width:100%;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain}
  .object-format__tabs{display:block;margin-bottom:6px;--cs-color-bg-light:transparent;--cs-color-bg-lighter:transparent;--cs-color-bg:color-mix(in srgb,var(--bc-active-color,#4857e2) 8%,transparent);--cs-color-text:var(--bc-active-color,#4857e2)}
  .object-format__tabs ::ng-deep .cs-segmented-item-selected,.object-format__tabs ::ng-deep .cs-segmented-thumb{box-shadow:none}
  .object-format__tab-section[hidden]{display:none}
  .object-format__tab-section{padding-bottom:0;border-bottom:0}
  .object-format--anchored{position:relative;width:34px;max-width:none}
  .object-format--anchored .object-format__panel{position:absolute;top:0;right:calc(100% + 8px);max-width:none}
  .object-format--anchored.object-format--left .object-format__panel{right:auto;left:calc(100% + 8px)}
  @media(pointer:coarse){.object-format__panel{--cs-sem-size-interactive-sm:var(--cs-sem-size-min-tap-target);--cs-sem-size-interactive-xs:var(--cs-sem-size-min-tap-target)}.object-format__rail{width:42px}.object-format__rail button{width:34px;min-width:34px;height:34px;min-height:34px}.object-format--anchored{width:42px}}
`
