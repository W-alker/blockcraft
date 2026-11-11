import {ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, NgZone, OnChanges, OnDestroy, inject} from '@angular/core'
import {BlockCraftDoc, type EditorInteractionMode, type EditorInteractionOverrides, type InteractionConfigDefinition, type InteractionField, type InteractionValue} from '@ccc/blockcraft'
import {Subscription} from 'rxjs'
import {EditingExperienceComponent} from './editing-experience.component'
type DebugGroup = {namespace: string; label: string; fields: Array<{key: string; field: InteractionField}>}

@Component({
  selector: 'playground-interaction-mode-debug',
  standalone: true,
  imports: [EditingExperienceComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mode-debug" data-testid="interaction-mode-debug">
      <playground-editing-experience [doc]="doc" />
      <details>
        <summary>个性化交互{{ customized ? ' · 已自定义' : '' }}</summary>
      <label for="debug-interaction-mode">底层预设</label>
      <select id="debug-interaction-mode" aria-label="编辑模式"
        [value]="doc?.interactionMode?.value || 'mixed'"
        [disabled]="!doc?.isInitialized || doc?.isReadonly"
        (change)="setMode($event)">
        <option value="mixed">混合编辑</option>
        <option value="immersive">沉浸编辑</option>
        <option value="design">设计编辑</option>
      </select>
      <p>{{ hint }}</p>
        @for (group of groups; track group.namespace) {
          <fieldset [disabled]="!doc?.isInitialized || doc?.isReadonly">
            <legend>{{ group.label }}</legend>
            @for (entry of group.fields; track entry.key) {
              <label class="option">{{ entry.field.label }}
                @if (entry.field.type === 'boolean' || entry.field.type === 'select') {
                  <select [attr.aria-label]="entry.field.label" [value]="selectValue(group.namespace, entry.key)"
                    (change)="setChoice(group.namespace, entry.key, $event)">
                    <option value="inherit">跟随预设</option>
                    @if (entry.field.type === 'boolean') {
                      <option value="true">开启</option><option value="false">关闭</option>
                    } @else {
                      @for (option of entry.field.options; track option.value) {
                        <option [value]="encode(option.value)">{{ option.label }}</option>
                      }
                    }
                  </select>
                } @else {
                  <select [attr.aria-label]="entry.field.label + '配置方式'"
                    [value]="overrideValue(group.namespace, entry.key) === undefined ? 'inherit' : 'custom'"
                    (change)="setInputMode(group.namespace, entry.key, $event)">
                    <option value="inherit">跟随预设</option><option value="custom">自定义</option>
                  </select>
                  @if (overrideValue(group.namespace, entry.key) !== undefined) {
                    <input [attr.aria-label]="entry.field.label" [type]="entry.field.type === 'number' ? 'number' : 'text'"
                      [attr.min]="entry.field.type === 'number' ? entry.field.min : null"
                      [attr.max]="entry.field.type === 'number' ? entry.field.max : null"
                      [attr.step]="entry.field.type === 'number' && entry.field.integer ? 1 : 'any'"
                      [attr.maxlength]="entry.field.type === 'text' ? entry.field.maxLength : null"
                      [value]="overrideValue(group.namespace, entry.key)"
                      (change)="setInput(group.namespace, entry.key, entry.field, $event)" />
                  }
                }
                <small>当前：{{ format(effectiveValue(group.namespace, entry.key), entry.field) }}</small>
              </label>
            }
          </fieldset>
        }
        <p>布局控件关闭时，悬停与聚焦抓手一起收起。正文仍可直接编辑。</p>
        <button type="button" [disabled]="!customized || doc?.isReadonly" (click)="reset()">恢复当前预设</button>
      </details>
      <a href="?example=floating-layout" target="_blank" rel="noopener">打开浮动排版模板 <span aria-hidden="true">↗</span></a>
      <small>新页面打开 · 可编辑的城市更新提案</small>
    </section>
  `,
  styles: [`
    :host { display: block; }
    .mode-debug { display: grid; gap: 10px; padding: 14px; border: 1px solid var(--bc-border-color-light); border-radius: 16px; background: var(--bc-bg-elevated); color: var(--bc-color); }
    label { font-size: 13px; font-weight: 600; }
    select, input, a { box-sizing: border-box; width: 100%; min-height: 34px; padding: 7px 10px; border: 1px solid var(--bc-border-color-light); border-radius: 6px; background: var(--bc-bg-primary); color: var(--bc-color); font: inherit; font-size: 13px; }
    select:focus-visible, input:focus-visible, a:focus-visible { outline: 2px solid var(--bc-active-color); outline-offset: 2px; }
    select:disabled, button:disabled { opacity: .55; }
    details { border-top: 1px solid var(--bc-border-color-light); padding-top: 10px; }
    summary { cursor: pointer; font-size: 13px; }
    fieldset { display: grid; gap: 10px; padding: 10px 0; border: 0; min-width: 0; }
    legend { padding-top: 12px; font-size: 12px; color: var(--bc-color-light); }
    .option { display: grid; gap: 4px; font-weight: 400; }
    button { margin-top: 10px; min-height: 34px; padding: 6px 10px; border: 1px solid var(--bc-border-color-light); border-radius: 6px; background: var(--bc-bg-primary); color: var(--bc-color); cursor: pointer; }
    button:focus-visible, summary:focus-visible { outline: 2px solid var(--bc-active-color); outline-offset: 2px; }
    a { display: flex; justify-content: space-between; text-decoration: none; color: var(--bc-active-color); }
    a:hover { background: var(--bc-active-color-lighter); }
    p, small { margin: 0; color: var(--bc-color-light); font-size: 12px; line-height: 1.6; }
  `],
})
export class InteractionModeDebugComponent implements OnChanges, OnDestroy {
  @Input() doc: BlockCraftDoc | null = null
  private subscriptions = new Subscription()
  private readonly cdr = inject(ChangeDetectorRef)
  private readonly zone = inject(NgZone)

  groups: DebugGroup[] = []
  readonly encode = JSON.stringify
  format(value: InteractionValue | undefined, field: InteractionField): string {
    if (field.type === 'select') return field.options.find(option => option.value === value)?.label ?? String(value ?? '')
    return typeof value === 'boolean' ? (value ? '开启' : '关闭') : String(value ?? '')
  }
  get customized(): boolean { return !!this.doc && Object.keys(this.doc.interaction.overrides).length > 0 }
  overrideValue(namespace: string, key: string): InteractionValue | undefined {
    const overrides = this.doc?.interaction.overrides
    return (namespace === 'native' ? overrides?.native as Record<string, InteractionValue> | undefined : overrides?.plugins?.[namespace])?.[key]
  }
  effectiveValue(namespace: string, key: string): InteractionValue | undefined {
    const policy = this.doc?.interaction.policy
    return (namespace === 'native' ? policy?.native as unknown as Record<string, InteractionValue> | undefined : policy?.plugins[namespace])?.[key]
  }
  selectValue(namespace: string, key: string): string {
    const value = this.overrideValue(namespace, key)
    return value === undefined ? 'inherit' : JSON.stringify(value)
  }
  setChoice(namespace: string, key: string, event: Event): void {
    const select = event.target as HTMLSelectElement
    if (!this.setField(namespace, key, select.value === 'inherit' ? undefined : JSON.parse(select.value))) {
      select.value = this.selectValue(namespace, key)
    }
  }
  setInputMode(namespace: string, key: string, event: Event): void {
    const select = event.target as HTMLSelectElement
    if (!this.setField(namespace, key, select.value === 'inherit' ? undefined : this.effectiveValue(namespace, key))) {
      select.value = this.overrideValue(namespace, key) === undefined ? 'inherit' : 'custom'
    }
  }
  setInput(namespace: string, key: string, field: InteractionField, event: Event): void {
    const input = event.target as HTMLInputElement
    const value = field.type === 'number' ? (input.value.trim() ? Number(input.value) : NaN) : input.value
    if (!this.setField(namespace, key, value)) input.value = String(this.overrideValue(namespace, key) ?? '')
  }
  private setField(namespace: string, key: string, value: InteractionValue | undefined): boolean {
    if (!this.doc) return false
    const overrides = this.doc.interaction.overrides
    const fields: Record<string, InteractionValue> = {...(namespace === 'native' ? overrides.native : overrides.plugins?.[namespace])}
    if (value === undefined) delete fields[key]
    else fields[key] = value
    return this.apply(namespace === 'native' ? {...overrides, native: fields as EditorInteractionOverrides['native']}
      : {...overrides, plugins: {...overrides.plugins, [namespace]: fields}})
  }
  reset(): void { this.apply({}) }
  private apply(overrides: EditorInteractionOverrides): boolean {
    const applied = this.doc?.interaction.setOverrides(overrides) ?? false
    if (!applied) this.doc?.messageService.warn('配置未生效，请检查取值，并结束当前输入或拖动')
    return applied
  }

  get hint(): string {
    if (!this.doc?.isInitialized) return '初始化文档后切换，或打开下方模板直接体验。'
    if (this.doc.isReadonly) return '只读时暂停编辑模式，恢复编辑后继续使用当前模式。'
    if (this.customized) return '已在当前预设上自定义。切换模式会清空覆盖；刷新页面不保留配置。'
    return {
      mixed: '悬停不显示对象边框和抓手，聚焦或选中后操作。',
      immersive: '专注内容，收起布局控制点与对象拖动。',
      design: '内部编辑显示对象工具栏，组合除外；文本对象聚焦显示八向抓手。',
    }[this.doc.interactionMode.value]
  }

  ngOnChanges(): void {
    this.subscriptions.unsubscribe()
    this.subscriptions = new Subscription()
    this.groups = []
    if (!this.doc) return
    const refresh = () => this.zone.run(() => {
      this.groups = this.doc!.interaction.definitions.map((definition: InteractionConfigDefinition) => ({
        namespace: definition.namespace, label: definition.label,
        fields: Object.entries(definition.fields).map(([key, field]) => ({key, field})),
      }))
      this.cdr.markForCheck()
    })
    this.subscriptions.add(this.doc.interaction.policyChanges$.subscribe(refresh))
    this.subscriptions.add(this.doc.readonlySwitch$.subscribe(refresh))
    this.subscriptions.add(this.doc.afterInit$.subscribe(refresh))
  }

  setMode(event: Event): void {
    const select = event.target as HTMLSelectElement
    if (this.doc && !this.doc.interactionMode.set(select.value as EditorInteractionMode)) {
      select.value = this.doc.interactionMode.value
      this.doc.messageService.warn('请先结束当前输入或拖动，再切换编辑模式')
    }
  }

  ngOnDestroy(): void { this.subscriptions.unsubscribe() }
}
