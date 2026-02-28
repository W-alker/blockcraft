/**
 * 倒计时浮窗组件 — 纯 DOM 实现，可拖拽，参考月度导向会计时器风格
 */
export class CountdownWidget {
  private container: HTMLElement | null = null;
  private el: HTMLElement | null = null;
  private timerInterval: number | null = null;
  private duration = 60; // 总时长（秒）
  private remaining = 60; // 剩余（秒）
  private state: 'idle' | 'running' | 'paused' | 'finished' = 'idle';

  // drag state
  private dragging = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private moveHandler: ((e: MouseEvent) => void) | null = null;
  private upHandler: (() => void) | null = null;

  // DOM refs
  private timeDisplay: HTMLElement | null = null;
  private statusLabel: HTMLElement | null = null;
  private startBtn: HTMLElement | null = null;
  private resetBtn: HTMLElement | null = null;
  private progressBar: HTMLElement | null = null;

  mount(container: HTMLElement) {
    this.container = container;
    this.el = document.createElement('div');
    this.el.className = 'countdown-widget';
    this.el.style.cssText = `
      position: fixed; top: 20px; right: 20px; z-index: 10005;
      width: 260px; background: #1a1a1f; color: #fff;
      border-radius: 10px; box-shadow: 0 8px 32px rgba(0,0,0,0.4);
      user-select: none; font-family: -apple-system, sans-serif;
      overflow: hidden;
    `;
    container.appendChild(this.el);
    this.buildDOM();
  }

  private buildDOM() {
    if (!this.el) return;
    this.el.innerHTML = '';

    // Header (draggable)
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex; align-items: center; justify-content: space-between;
      padding: 8px 12px; cursor: move; background: rgba(255,255,255,0.05);
    `;
    const dragIcon = document.createElement('span');
    dragIcon.style.cssText = 'font-size: 12px; color: rgba(255,255,255,0.4); margin-right: 8px;';
    dragIcon.textContent = '⠿';
    const title = document.createElement('span');
    title.style.cssText = 'font-size: 13px; flex: 1;';
    title.textContent = '倒计时';
    this.statusLabel = document.createElement('span');
    this.statusLabel.style.cssText = 'font-size: 11px; color: rgba(255,255,255,0.5);';
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = `
      background: none; border: none; color: rgba(255,255,255,0.5);
      font-size: 14px; cursor: pointer; margin-left: 8px; padding: 0 4px;
    `;
    closeBtn.onclick = () => this.unmount();
    header.append(dragIcon, title, this.statusLabel, closeBtn);
    this.el.appendChild(header);

    // Drag events
    header.addEventListener('mousedown', (e) => {
      this.dragging = true;
      const rect = this.el!.getBoundingClientRect();
      this.dragOffsetX = e.clientX - rect.left;
      this.dragOffsetY = e.clientY - rect.top;
    });
    this.moveHandler = (e: MouseEvent) => {
      if (!this.dragging || !this.el) return;
      this.el.style.left = (e.clientX - this.dragOffsetX) + 'px';
      this.el.style.top = (e.clientY - this.dragOffsetY) + 'px';
      this.el.style.right = 'auto';
    };
    this.upHandler = () => { this.dragging = false; };
    document.addEventListener('mousemove', this.moveHandler);
    document.addEventListener('mouseup', this.upHandler);

    // Progress bar
    const progressWrap = document.createElement('div');
    progressWrap.style.cssText = 'height: 3px; background: rgba(255,255,255,0.1);';
    this.progressBar = document.createElement('div');
    this.progressBar.style.cssText = 'height: 100%; width: 100%; background: #3970F7; transition: width 1s linear;';
    progressWrap.appendChild(this.progressBar);
    this.el.appendChild(progressWrap);

    // Time display
    this.timeDisplay = document.createElement('div');
    this.timeDisplay.style.cssText = `
      font-size: 48px; font-weight: 700; text-align: center;
      padding: 16px 0 8px; font-family: monospace; letter-spacing: 2px;
    `;
    this.el.appendChild(this.timeDisplay);

    // Duration selector
    const durRow = document.createElement('div');
    durRow.style.cssText = 'display: flex; justify-content: center; gap: 6px; padding: 0 12px 12px;';
    for (const d of [30, 60, 180, 300]) {
      const btn = document.createElement('button');
      const label = d < 60 ? `${d}秒` : `${d / 60}分钟`;
      btn.textContent = label;
      btn.style.cssText = `
        padding: 3px 10px; border-radius: 4px; font-size: 11px;
        cursor: pointer; border: 1px solid rgba(255,255,255,0.2);
        background: ${this.duration === d ? 'rgba(57,112,247,0.3)' : 'transparent'};
        color: ${this.duration === d ? '#fff' : 'rgba(255,255,255,0.6)'};
      `;
      btn.onclick = () => {
        if (this.state === 'running') return;
        this.setDuration(d);
        this.buildDOM(); // rebuild to update active state
      };
      durRow.appendChild(btn);
    }
    this.el.appendChild(durRow);

    // Buttons
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display: flex; gap: 8px; padding: 0 12px 12px; justify-content: center;';
    this.startBtn = document.createElement('button');
    this.startBtn.style.cssText = `
      flex: 1; padding: 6px 0; border-radius: 6px; border: none;
      font-size: 13px; cursor: pointer; color: #fff; background: #29bb67;
    `;
    this.startBtn.onclick = () => this.toggleStartPause();
    this.resetBtn = document.createElement('button');
    this.resetBtn.textContent = '重置';
    this.resetBtn.style.cssText = `
      padding: 6px 16px; border-radius: 6px; font-size: 13px;
      cursor: pointer; color: rgba(255,255,255,0.7);
      background: transparent; border: 1px solid rgba(255,255,255,0.2);
    `;
    this.resetBtn.onclick = () => this.reset();
    btnRow.append(this.startBtn, this.resetBtn);
    this.el.appendChild(btnRow);

    this.updateDisplay();
  }
  setDuration(seconds: number) {
    this.duration = seconds;
    this.remaining = seconds;
    this.state = 'idle';
    this.stopTimer();
    this.updateDisplay();
  }

  private toggleStartPause() {
    if (this.state === 'idle' || this.state === 'finished') {
      this.state = 'running';
      this.startTimer();
    } else if (this.state === 'running') {
      this.state = 'paused';
      this.stopTimer();
    } else if (this.state === 'paused') {
      this.state = 'running';
      this.startTimer();
    }
    this.updateDisplay();
  }

  private reset() {
    this.stopTimer();
    this.remaining = this.duration;
    this.state = 'idle';
    this.updateDisplay();
  }

  private startTimer() {
    this.stopTimer();
    this.timerInterval = window.setInterval(() => {
      this.remaining--;
      if (this.remaining <= 0) {
        this.remaining = 0;
        this.state = 'finished';
        this.stopTimer();
        this.flashFinish();
      }
      this.updateDisplay();
    }, 1000);
  }

  private stopTimer() {
    if (this.timerInterval !== null) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  private flashFinish() {
    if (!this.timeDisplay) return;
    let count = 0;
    const flash = () => {
      if (count >= 6 || !this.timeDisplay) return;
      this.timeDisplay.style.color = count % 2 === 0 ? '#ff4f51' : '#fff';
      count++;
      setTimeout(flash, 300);
    };
    flash();
  }

  private updateDisplay() {
    if (!this.timeDisplay || !this.startBtn || !this.statusLabel || !this.progressBar) return;
    const m = Math.floor(this.remaining / 60);
    const s = this.remaining % 60;
    this.timeDisplay.textContent = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    this.timeDisplay.style.color = this.state === 'finished' ? '#ff4f51' : '#fff';

    const progress = this.duration > 0 ? (this.remaining / this.duration) * 100 : 100;
    this.progressBar.style.width = progress + '%';
    this.progressBar.style.background = this.state === 'finished' ? '#ff4f51' : '#3970F7';

    switch (this.state) {
      case 'idle': this.statusLabel.textContent = ''; this.startBtn.textContent = '开始'; this.startBtn.style.background = '#29bb67'; break;
      case 'running': this.statusLabel.textContent = '计时中'; this.startBtn.textContent = '暂停'; this.startBtn.style.background = '#faad14'; break;
      case 'paused': this.statusLabel.textContent = '已暂停'; this.startBtn.textContent = '继续'; this.startBtn.style.background = '#29bb67'; break;
      case 'finished': this.statusLabel.textContent = '已结束'; this.startBtn.textContent = '开始'; this.startBtn.style.background = '#29bb67'; break;
    }
  }

  isVisible(): boolean {
    return !!this.el;
  }

  unmount() {
    this.stopTimer();
    if (this.moveHandler) document.removeEventListener('mousemove', this.moveHandler);
    if (this.upHandler) document.removeEventListener('mouseup', this.upHandler);
    this.el?.remove();
    this.el = null;
    this.container = null;
  }
}