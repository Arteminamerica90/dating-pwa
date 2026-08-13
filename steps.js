export class StepCounter {
  constructor({ onStep } = {}) {
    this.onStep = onStep || (() => {});
    this.running = false;

    this._lastPeakTs = 0;
    this._above = false;
    this._ema = 0;
    this._steps = 0;

    this._onMotion = this._onMotion.bind(this);
  }

  get steps() {
    return this._steps;
  }

  reset(steps = 0) {
    this._steps = Math.max(0, Math.floor(Number(steps) || 0));
    this._ema = 0;
    this._above = false;
    this._lastPeakTs = 0;
  }

  async start() {
    if (this.running) return;

    if (!('DeviceMotionEvent' in window)) {
      throw new Error('DeviceMotionEvent недоступен в этом браузере');
    }

    // iOS Safari requires explicit permission.
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
      const res = await DeviceMotionEvent.requestPermission();
      if (res !== 'granted') {
        throw new Error('Разрешение на датчики не выдано');
      }
    }

    this.running = true;
    window.addEventListener('devicemotion', this._onMotion, { passive: true });
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    window.removeEventListener('devicemotion', this._onMotion);
  }

  _onMotion(ev) {
    const acc = ev.accelerationIncludingGravity;
    if (!acc) return;

    const x = acc.x || 0;
    const y = acc.y || 0;
    const z = acc.z || 0;

    const mag = Math.sqrt(x * x + y * y + z * z);

    // Remove slow drift with EMA; use residual as "step energy".
    const alpha = 0.1;
    this._ema = this._ema === 0 ? mag : this._ema + alpha * (mag - this._ema);
    const residual = mag - this._ema;

    // Threshold + refractory period (simple, noisy but ok for demo).
    const TH = 1.2;
    const now = performance.now();
    const minGapMs = 320;

    if (!this._above && residual > TH) {
      this._above = true;
      if (now - this._lastPeakTs > minGapMs) {
        this._lastPeakTs = now;
        this._steps += 1;
        this.onStep(this._steps);
      }
    }

    if (this._above && residual < 0.4) {
      this._above = false;
    }
  }
}
