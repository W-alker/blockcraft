import {normalizeObjectAnimation, storeObjectAnimation, type ObjectAnimationConfig} from './config';

interface Target {
  id: string;
  config: ObjectAnimationConfig;
  signature: string;
  visible: boolean;
  suspended: boolean;
  resumeTime?: number;
  animation?: Animation;
  restore?: () => void;
}

/** Browser-only presentation. No model writes, Angular dependencies or scroll measurements. */
export class ObjectAnimationPlayer {
  private readonly targets = new Map<HTMLElement, Target>();
  private readonly played = new Map<string, string>();
  private readonly observer?: IntersectionObserver;
  private readonly motion: MediaQueryList;
  private readonly print: MediaQueryList;
  private enabled = false;
  private printing = false;
  private destroyed = false;

  constructor(private readonly owner: Document) {
    const view = owner.defaultView!;
    this.motion = view.matchMedia('(prefers-reduced-motion: reduce)');
    this.print = view.matchMedia('print');
    if (typeof IntersectionObserver !== 'undefined') {
      // Viewport-root also accounts for clipping by all nested scroll ancestors.
      this.observer = new IntersectionObserver(entries => {
        for (const entry of entries) {
          const element = entry.target as HTMLElement;
          const target = this.targets.get(element);
          if (!target) continue;
          target.visible = entry.isIntersecting && entry.intersectionRatio > 0;
          if (target.visible) this.autoplay(element, target);
          else this.stop(element);
        }
      }, {threshold: 0});
    }
    this.motion.addEventListener('change', this.refresh);
    this.print.addEventListener('change', this.refresh);
    view.addEventListener('beforeprint', this.beforePrint);
    view.addEventListener('afterprint', this.afterPrint);
    owner.addEventListener('visibilitychange', this.visibilityChange);
  }

  get reducedMotion(): boolean { return this.motion.matches; }

  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    // A new reading session may replay; virtual remounts within it may not.
    this.played.clear();
    this.stopAll();
    this.refresh();
  }

  set(element: HTMLElement, id: string, value: unknown, suspended = false): void {
    const config = normalizeObjectAnimation(value);
    if (!config || this.destroyed) { this.remove(element); return; }
    const signature = storeObjectAnimation(config)!;
    const previous = this.targets.get(element);
    if (previous?.id === id && previous.signature === signature) {
      this.setSuspended(element, suspended);
      this.autoplay(element, previous);
      return;
    }
    this.stop(element);
    const target: Target = {id, config, signature, suspended, visible: previous?.visible ?? false};
    this.targets.set(element, target);
    this.observer?.observe(element);
    this.autoplay(element, target);
  }

  remove(element: HTMLElement): void {
    this.stop(element);
    this.observer?.unobserve(element);
    this.targets.delete(element);
  }

  /** Deletion releases identity history; a virtual view disposal deliberately does not. */
  forget(id: string): void { this.played.delete(id); }

  preview(element: HTMLElement, onFinish?: () => void): boolean {
    const target = this.targets.get(element);
    return !!target && this.start(element, target, true, onFinish);
  }

  /** Restore authored geometry while editing, retaining playback progress locally. */
  setSuspended(element: HTMLElement, suspended: boolean): void {
    const target = this.targets.get(element);
    if (!target || target.suspended === suspended) return;
    target.suspended = suspended;
    if (suspended) {
      const time = target.animation?.currentTime;
      this.stop(element);
      if (typeof time === 'number') target.resumeTime = time;
    } else this.autoplay(element, target);
  }

  stop(element: HTMLElement): void {
    const target = this.targets.get(element);
    if (!target) return;
    target.animation?.cancel();
    target.animation = undefined;
    target.resumeTime = undefined;
    target.restore?.();
    target.restore = undefined;
  }

  stopAll(): void { for (const element of this.targets.keys()) this.stop(element); }

  private autoplay(element: HTMLElement, target: Target): void {
    if (!this.enabled || target.suspended || !target.visible || target.animation || this.owner.hidden) return;
    if (target.resumeTime === undefined && target.config.iterations !== 'infinite' && this.played.get(target.id) === target.signature) return;
    const time = target.resumeTime;
    if (this.start(element, target, false, undefined, time)) {
      this.played.set(target.id, target.signature);
    }
  }

  private start(element: HTMLElement, target: Target, preview: boolean, onFinish?: () => void, resumeTime?: number): boolean {
    this.stop(element);
    if (this.destroyed || this.motion.matches || this.print.matches || this.printing ||
      this.owner.hidden || !element.isConnected || typeof element.getAnimations !== 'function') return false;
    // Flush the restored CSS before reapplying the same keyframe name. Otherwise
    // browsers retain the cancelled CSSAnimation across a synchronous stop/start.
    element.getAnimations();
    const config = target.config;
    const original = element.style.animation;
    const priority = element.style.getPropertyPriority('animation');
    target.restore = () => {
      if (original) element.style.setProperty('animation', original, priority);
      else element.style.removeProperty('animation');
      element.removeAttribute('data-bc-animating');
    };
    element.setAttribute('data-bc-animating', '');
    element.style.animation = storeObjectAnimation(preview && config.iterations === 'infinite'
      ? {...config, iterations: 2} : config)!;
    // Read the browser-created CSSAnimation once at playback start. No forced layout per frame.
    const animationName = storeObjectAnimation(config)!.split(' ')[0];
    const animation = element.getAnimations().find(item =>
      'animationName' in item && (item as CSSAnimation).animationName === animationName &&
      (item.effect as KeyframeEffect | null)?.target === element);
    if (!animation) { this.stop(element); return false; }
    target.animation = animation;
    if (resumeTime !== undefined) animation.currentTime = resumeTime;
    animation.onfinish = () => {
      if (target.animation === animation) {
        this.stop(element);
        onFinish?.();
      }
    };
    return true;
  }

  private readonly refresh = (): void => {
    if (this.motion.matches || this.print.matches || this.printing) { this.stopAll(); return; }
    for (const [element, target] of this.targets) this.autoplay(element, target);
  };
  private readonly beforePrint = (): void => { this.printing = true; this.stopAll(); };
  private readonly afterPrint = (): void => { this.printing = false; this.refresh(); };
  private readonly visibilityChange = (): void => {
    for (const target of this.targets.values()) {
      if (this.owner.hidden) target.animation?.pause();
      else if (target.animation?.playState === 'paused') target.animation.play();
    }
    if (!this.owner.hidden) this.refresh();
  };

  destroy(): void {
    this.destroyed = true;
    this.stopAll();
    this.observer?.disconnect();
    this.targets.clear();
    this.played.clear();
    this.motion.removeEventListener('change', this.refresh);
    this.print.removeEventListener('change', this.refresh);
    this.owner.defaultView?.removeEventListener('beforeprint', this.beforePrint);
    this.owner.defaultView?.removeEventListener('afterprint', this.afterPrint);
    this.owner.removeEventListener('visibilitychange', this.visibilityChange);
  }
}
