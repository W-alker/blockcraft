import type {DateParts} from '../date-card-parts.util';

// 固定英文设计文案，不受操作系统 ICU / locale 影响；不扩大通用日期解析器的字段契约。
const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
export const monthNameOf = (parts: DateParts): string => MONTHS[Number(parts['MM']) - 1] ?? parts['MMM'] ?? '';
