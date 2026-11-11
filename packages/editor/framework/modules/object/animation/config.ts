/** Preset names are real CSS @keyframes shipped in themes/base.scss. */
export const OBJECT_ANIMATION_EFFECTS = [
  {value: 'fade', label: '淡入', category: 'entrance'},
  {value: 'slide', label: '飞入', category: 'entrance'},
  {value: 'zoom', label: '缩放', category: 'entrance'},
  {value: 'bounce', label: '弹入', category: 'entrance'},
  {value: 'flip', label: '翻入', category: 'entrance'},
  {value: 'rotate', label: '旋入', category: 'entrance'},
  {value: 'roll', label: '滚入', category: 'entrance'},
  {value: 'drop', label: '落入', category: 'entrance'},
  {value: 'pulse', label: '呼吸', category: 'emphasis'},
  {value: 'swing', label: '摇摆', category: 'emphasis'},
  {value: 'heartbeat', label: '心跳', category: 'emphasis'},
  {value: 'shake', label: '抖动', category: 'emphasis'},
  {value: 'hop', label: '弹跳', category: 'emphasis'},
  {value: 'float', label: '漂浮', category: 'emphasis'},
  {value: 'wobble', label: '晃动', category: 'emphasis'},
  {value: 'spin', label: '旋转', category: 'emphasis'},
] as const;
export type ObjectAnimationEffect = typeof OBJECT_ANIMATION_EFFECTS[number]['value'];
export interface ObjectAnimationConfig {
  effect: ObjectAnimationEffect;
  duration: number;
  delay: number;
  iterations: number | 'infinite';
  direction: 'up' | 'down' | 'left' | 'right';
  easing: string;
  playbackDirection: 'normal' | 'reverse' | 'alternate' | 'alternate-reverse';
  fill: 'none' | 'forwards' | 'backwards' | 'both';
}
const names: Record<Exclude<ObjectAnimationEffect, 'slide'>, string> = {
  fade: 'bc-fade-in', zoom: 'bc-zoom-in', bounce: 'bc-bounce-in', pulse: 'bc-pulse', swing: 'bc-swing',
  flip: 'bc-flip-in', rotate: 'bc-rotate-in', roll: 'bc-roll-in', drop: 'bc-drop-in',
  heartbeat: 'bc-heartbeat', shake: 'bc-shake', hop: 'bc-hop', float: 'bc-float', wobble: 'bc-wobble', spin: 'bc-spin',
};
const directions = ['up', 'down', 'left', 'right'];
const playbackDirections = ['normal', 'reverse', 'alternate', 'alternate-reverse'];
const fills = ['none', 'forwards', 'backwards', 'both'];
function validEasing(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (/^(linear|ease|ease-in|ease-out|ease-in-out|step-start|step-end)$/.test(value)) return true;
  const bezier = /^cubic-bezier\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)$/.exec(value);
  if (bezier) {
    const values = bezier.slice(1).map(Number);
    return values.every(Number.isFinite) && values[0] >= 0 && values[0] <= 1 && values[2] >= 0 && values[2] <= 1;
  }
  return /^steps\([1-9]\d*(?:,\s*(?:start|end|jump-start|jump-end|jump-both))?\)$/.test(value);
}

/** Parse a single CSS animation shorthand; unsupported names remain static, never eval'd. */
export function normalizeObjectAnimation(value: unknown): ObjectAnimationConfig | null {
  let input: Partial<ObjectAnimationConfig>;
  if (typeof value === 'string') {
    // Keep timing functions (including their spaces/commas) as one token.
    const tokens = value.trim().match(/[a-z-]+\([^)]*\)|[^\s]+/gi) ?? [];
    input = {easing: 'ease', fill: 'none'};
    let times = 0;
    const seen = new Set<string>();
    for (const token of tokens) {
      let category: string;
      const effect = Object.entries(names).find(([, name]) => name === token)?.[0] as ObjectAnimationEffect | undefined;
      const slide = /^bc-slide-in-(up|down|left|right)$/.exec(token);
      if (effect || slide) {
        category = 'name'; input.effect = effect ?? 'slide';
        if (slide) input.direction = slide[1] as ObjectAnimationConfig['direction'];
      } else if (/^\d*\.?\d+(ms|s)$/.test(token)) {
        category = `time-${times}`;
        const milliseconds = parseFloat(token) * (token.endsWith('ms') ? 1 : 1000);
        if (++times > 2 || !Number.isFinite(milliseconds)) return null;
        if (times === 1) input.duration = milliseconds; else input.delay = milliseconds;
      } else if (validEasing(token)) { category = 'easing'; input.easing = token; }
      else if (token === 'infinite' || /^\d+$/.test(token)) {
        category = 'iterations'; input.iterations = token === 'infinite' ? token : Number(token);
      } else if (playbackDirections.includes(token)) { category = 'direction'; input.playbackDirection = token as ObjectAnimationConfig['playbackDirection']; }
      else if (fills.includes(token)) { category = 'fill'; input.fill = token as ObjectAnimationConfig['fill']; }
      else if (token === 'running') category = 'state';
      else return null;
      if (seen.has(category)) return null;
      seen.add(category);
    }
    if (!times) return null;
  } else if (value && typeof value === 'object') input = value as Partial<ObjectAnimationConfig>;
  else return null;
  if (!OBJECT_ANIMATION_EFFECTS.some(item => item.value === input.effect)) return null;
  const bounded = (n: unknown, fallback: number, min: number, max: number) =>
    typeof n === 'number' && Number.isFinite(n) ? Math.round(Math.min(max, Math.max(min, n))) : fallback;
  return {
    effect: input.effect!, duration: bounded(input.duration, 600, 100, 10000),
    delay: bounded(input.delay, 0, 0, 10000),
    iterations: input.iterations === 'infinite' ? 'infinite' : bounded(input.iterations, 1, 1, 10),
    direction: directions.includes(input.direction ?? '') ? input.direction! : 'up',
    easing: validEasing(input.easing) ? input.easing : 'ease-out',
    playbackDirection: playbackDirections.includes(input.playbackDirection ?? '') ? input.playbackDirection! : 'normal',
    fill: fills.includes(input.fill ?? '') ? input.fill! : 'both',
  };
}

/** Output can be assigned directly to HTMLElement.style.animation. No parallel persisted config. */
export function storeObjectAnimation(value: unknown): string | null {
  const config = normalizeObjectAnimation(value);
  if (!config) return null;
  const name = config.effect === 'slide' ? `bc-slide-in-${config.direction}` : names[config.effect];
  return `${name} ${config.duration}ms ${config.easing} ${config.delay}ms ${config.iterations} ${config.playbackDirection} ${config.fill}`;
}
