import { defineMaterialStyles, materialStyleFixedSize } from '../kernel/material-styles.util';
import { ColumnCardComponent } from './styles/column.card';
import { RowCardComponent } from './styles/row.card';
import { RowPinyinCardComponent } from './styles/row-pinyin.card';
import { personCardContentScale } from './person-card-layout';

/** 各样式的默认内容尺寸，同时用于缩略图；外框含 4px 留白。 */
const styles = defineMaterialStyles('style', '样式', [
    { id: 'row', label: '横排', component: RowCardComponent, defaultWidth: 175, defaultAr: 5.48 },
    { id: 'rowPinyin', label: '横排拼音', component: RowPinyinCardComponent, defaultWidth: 230, defaultAr: 5.75 },
    { id: 'column', label: '竖排', component: ColumnCardComponent, defaultWidth: 70, defaultAr: 0.84 }
]);

/** 切换样式恢复该样式外框，保留整体倍率及各样式字号覆盖。 */
export const PERSON_CARD_STYLES: typeof styles = {
    ...styles,
    applySize(block, style) {
        const scale = personCardContentScale(block.props);
        const raw = materialStyleFixedSize(style, null, scale);
        const size = {width: Math.round(raw.width), height: Math.round(raw.height)};
        if (block.props['width'] === size.width && block.props['height'] === size.height) return;
        block.updateProps({...size, sc: Math.round(scale * 100) / 100, u: null, wr: null, ar: null});
    }
};
