import {NgComponentOutlet} from '@angular/common';
import {A11yModule} from '@angular/cdk/a11y';
import {ChangeDetectionStrategy, Component, computed, EventEmitter, Input, Output, signal} from '@angular/core';
import {CsButtonComponent, CsColorPickerComponent, CsInputNumberComponent, CsOptionComponent, CsSelectComponent} from '@cses/ui';
import {TYPOGRAPHY_FONT_FAMILIES} from '../../../framework/block-std/typography/core';
import {defineBorderConfigs} from '../kernel/material-border.util';
import {materialStyleFixedSize} from '../kernel/material-styles.util';
import {DATE_CARD_STYLES} from './date-card.styles';
import {dateCardFonts, storeDateCardFont, type DateCardFontRole} from './date-card-typography';
import {readDateCardLook} from './date-card-look.util';
import {partsOf} from './date-card-parts.util';
import type {DateCardModel} from './date-card-render.component';

type Props = DateCardModel['props'];

/** 独立于宿主侧栏；只在确认时提交改过的字段，预览不产生撤销记录。 */
@Component({
    selector: 'bc-date-card-settings', standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [NgComponentOutlet, CsColorPickerComponent, CsSelectComponent, CsOptionComponent, CsInputNumberComponent, CsButtonComponent, A11yModule],
    host: {contenteditable: 'false', '(keydown.escape)': 'cancel.emit()'},
    templateUrl: './date-card-settings.component.html',
    styleUrl: './date-card-settings.component.scss'
})
export class DateCardSettingsComponent {
    private initialStyle = '';
    private readonly dirty = new Set<string>();
    protected readonly value = signal<Props>({});
    @Input() set props(props: Props) {
        this.value.set({...props});
        this.initialStyle = DATE_CARD_STYLES.resolve(props.style).id;
        this.dirty.clear();
    }
    @Input() scale = 1;
    @Output() readonly apply = new EventEmitter<Partial<Props>>();
    @Output() readonly cancel = new EventEmitter<void>();
    protected readonly styles = DATE_CARD_STYLES.all;
    protected readonly families = TYPOGRAPHY_FONT_FAMILIES;
    protected readonly borders = defineBorderConfigs()[0].options!;
    protected readonly colors = [
        {key: 'fg' as const, label: '文字 / 主色'},
        {key: 'bg' as const, label: '背景色'},
        {key: 'bc' as const, label: '边框色'}
    ];
    protected readonly look = computed(() => readDateCardLook(this.value()));
    protected readonly parts = computed(() => partsOf(this.value().date));
    protected readonly previewSize = computed(() => materialStyleFixedSize(this.look().style, this.value().format));
    // 缩略预览只缩放浮层内部，不参与卡片几何或字号持久化。
    protected readonly previewFit = computed(() => {
        const size = this.previewSize();
        const scale = Math.min(84 / size.width, 108 / size.height, 1);
        return {width: size.width * scale, height: size.height * scale, scale};
    });
    protected readonly fonts = computed(() => dateCardFonts(this.value().style, this.value(), this.value().format).filter(font => font.visible));
    protected get fontScale(): number { return this.look().style.id === this.initialStyle ? this.scale : 1; }
    protected displaySize(size: number): number { return Math.round(size * this.fontScale * 10) / 10; }
    protected set(key: string, value: unknown): void {
        if (value !== null && typeof value !== 'string') return;
        this.dirty.add(key);
        this.value.update(props => ({...props, [key]: value || null}));
    }
    protected setSize(role: DateCardFontRole, size: number | null): void {
        if (size === null) return;
        if (!Number.isFinite(size) || size < 4 || size > 512) return;
        const patch = storeDateCardFont(this.value().style, this.value(), role, size / this.fontScale);
        for (const [key, value] of Object.entries(patch)) this.set(key, value);
    }
    protected resetFonts(): void { this.set(this.fonts()[0].key, null); }
    protected resetColors(): void { for (const color of this.colors) this.set(color.key, null); }
    protected confirm(): void {
        this.apply.emit(Object.fromEntries([...this.dirty].map(key => [key, this.value()[key]])));
    }
}
