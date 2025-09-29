export type PointerZone = 'top-card' | 'other-card' | 'trigger' | 'none';
export type InputType = 'mouse' | 'touch' | 'pen';

export interface PointerState {
  x: number;
  y: number;
  overZone: PointerZone;
  timestamp: number;
  inputType: InputType;
  velocity?: { x: number; y: number };
}

export interface PointerEngineOptions {
  debug?: boolean;
  skipFrameThreshold?: number;
  velocitySmoothing?: number;
}

export type PointerEngineListener = (state: PointerState) => void;

export class PointerEngine {
  private listeners = new Set<PointerEngineListener>();
  private triggers = new Map<HTMLElement, string>();
  private cards = new Map<HTMLElement, string>();
  private scrollContainers = new Set<HTMLElement>();
  
  private lastPointer: PointerState = {
    x: -1,
    y: -1,
    overZone: 'none',
    timestamp: Date.now(),
    inputType: 'mouse'
  };
  
  private frameRequest: number | null = null;
  private frameSkipCounter = 0;
  private lastCheckBounds = new WeakMap<HTMLElement, DOMRect>();
  private debugOverlay: HTMLElement | null = null;
  
  constructor(private options: PointerEngineOptions = {}) {
    if (options.debug) {
      this.createDebugOverlay();
    }
  }

  start() {
    window.addEventListener('pointermove', this.handlePointerMove, { passive: true });
    window.addEventListener('pointerleave', this.handlePointerLeave);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    
    // Touch events for better mobile support
    window.addEventListener('touchstart', this.handleTouchStart, { passive: true });
    window.addEventListener('touchmove', this.handleTouchMove, { passive: true });
    window.addEventListener('touchend', this.handleTouchEnd);
  }

  stop() {
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerleave', this.handlePointerLeave);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    window.removeEventListener('touchstart', this.handleTouchStart);
    window.removeEventListener('touchmove', this.handleTouchMove);
    window.removeEventListener('touchend', this.handleTouchEnd);
    
    if (this.frameRequest) {
      cancelAnimationFrame(this.frameRequest);
      this.frameRequest = null;
    }
    
    this.removeDebugOverlay();
    this.scrollContainers.forEach(el => {
      el.removeEventListener('scroll', this.handleScroll);
    });
  }

  registerTrigger(element: HTMLElement, term: string) {
    this.triggers.set(element, term);
    this.forceCheckPointerZone();
  }

  unregisterTrigger(element: HTMLElement) {
    this.triggers.delete(element);
    this.forceCheckPointerZone();
  }

  registerCard(element: HTMLElement, cardId: string) {
    this.cards.set(element, cardId);
    this.forceCheckPointerZone();
  }

  unregisterCard(element: HTMLElement) {
    this.cards.delete(element);
    this.forceCheckPointerZone();
  }

  registerScrollContainer(element: HTMLElement) {
    this.scrollContainers.add(element);
    element.addEventListener('scroll', this.handleScroll, { passive: true });
  }

  unregisterScrollContainer(element: HTMLElement) {
    this.scrollContainers.delete(element);
    element.removeEventListener('scroll', this.handleScroll);
  }

  subscribe(listener: PointerEngineListener) {
    this.listeners.add(listener);
    // Immediately provide current state
    listener(this.lastPointer);
  }

  unsubscribe(listener: PointerEngineListener) {
    this.listeners.delete(listener);
  }

  getTopCardId(): string | null {
    // This will be provided by the consumer
    return null;
  }

  setTopCardId(id: string | null) {
    // Allow provider to inform us of the current top card
    this.checkPointerZone();
  }

  forceCheckPointerZone() {
    if (this.frameRequest) {
      cancelAnimationFrame(this.frameRequest);
      this.frameRequest = null;
    }
    this.checkPointerZone();
  }

  private handlePointerMove = (e: PointerEvent) => {
    const inputType = this.getInputType(e);
    this.updatePointer(e.clientX, e.clientY, inputType);
  };

  private handleTouchStart = (e: TouchEvent) => {
    if (e.touches.length > 0) {
      const touch = e.touches[0];
      this.updatePointer(touch.clientX, touch.clientY, 'touch');
    }
  };

  private handleTouchMove = (e: TouchEvent) => {
    if (e.touches.length > 0) {
      const touch = e.touches[0];
      this.updatePointer(touch.clientX, touch.clientY, 'touch');
    }
  };

  private handleTouchEnd = () => {
    // On touch end, mark zone as none after a delay
    setTimeout(() => {
      this.updatePointer(this.lastPointer.x, this.lastPointer.y, 'touch', true);
    }, 100);
  };

  private handlePointerLeave = () => {
    this.updatePointer(-1, -1, this.lastPointer.inputType);
  };

  private handleVisibilityChange = () => {
    if (document.hidden) {
      this.updatePointer(-1, -1, this.lastPointer.inputType);
    }
  };

  private handleScroll = () => {
    // Invalidate cached bounds on scroll
    this.lastCheckBounds = new WeakMap();
    this.checkPointerZone();
  };

  private updatePointer(x: number, y: number, inputType: InputType, forceCheck = false) {
    const now = Date.now();
    const dt = now - this.lastPointer.timestamp;
    
    // Calculate velocity if enough time has passed
    let velocity: { x: number; y: number } | undefined;
    if (dt > 16 && this.lastPointer.x >= 0) {
      const vx = (x - this.lastPointer.x) / dt * 1000;
      const vy = (y - this.lastPointer.y) / dt * 1000;
      velocity = { x: vx, y: vy };
    }

    // Update pointer state
    this.lastPointer = {
      x,
      y,
      overZone: this.lastPointer.overZone,
      timestamp: now,
      inputType,
      velocity
    };

    // Skip frame optimization
    if (!forceCheck && this.shouldSkipFrame()) {
      this.frameSkipCounter++;
      if (this.frameSkipCounter < 3) return;
    }
    this.frameSkipCounter = 0;

    // Schedule zone check on next frame
    if (!this.frameRequest) {
      this.frameRequest = requestAnimationFrame(() => {
        this.frameRequest = null;
        this.checkPointerZone();
      });
    }
  }

  private shouldSkipFrame(): boolean {
    if (!this.lastPointer.velocity) return false;
    const threshold = this.options.skipFrameThreshold ?? 5;
    const v = this.lastPointer.velocity;
    return Math.abs(v.x) < threshold && Math.abs(v.y) < threshold;
  }

  private checkPointerZone() {
    const { x, y } = this.lastPointer;
    
    // If pointer is outside viewport
    if (x < 0 || y < 0) {
      this.setZone('none');
      return;
    }

    // Get elements at point
    const elements = this.getElementsAtPoint(x, y);
    
    // Check for cards first (highest priority)
    for (const el of elements) {
      const cardEl = el.closest('[data-card-id]') as HTMLElement;
      if (cardEl && this.cards.has(cardEl)) {
        const cardId = this.cards.get(cardEl)!;
        const topCardId = this.getTopCardId();
        const zone: PointerZone = cardId === topCardId ? 'top-card' : 'other-card';
        this.setZone(zone);
        return;
      }
    }

    // Check for triggers
    for (const el of elements) {
      const triggerEl = el.closest('[data-hover-term]') as HTMLElement;
      if (triggerEl && this.triggers.has(triggerEl)) {
        this.setZone('trigger');
        return;
      }
    }

    // Nothing found
    this.setZone('none');
  }

  private getElementsAtPoint(x: number, y: number): Element[] {
    if (document.elementsFromPoint) {
      return Array.from(document.elementsFromPoint(x, y));
    }
    
    // Fallback for older browsers
    const topEl = document.elementFromPoint(x, y);
    if (!topEl) return [];
    
    const elements: Element[] = [];
    let current: Element | null = topEl;
    while (current) {
      elements.push(current);
      current = current.parentElement;
    }
    return elements;
  }

  private setZone(zone: PointerZone) {
    if (this.lastPointer.overZone !== zone) {
      this.lastPointer.overZone = zone;
      this.notifyListeners();
      this.updateDebugOverlay();
    }
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener(this.lastPointer));
  }

  private getInputType(e: PointerEvent): InputType {
    if (e.pointerType === 'touch') return 'touch';
    if (e.pointerType === 'pen') return 'pen';
    return 'mouse';
  }

  private createDebugOverlay() {
    if (typeof document === 'undefined') return;
    
    this.debugOverlay = document.createElement('div');
    this.debugOverlay.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: rgba(0,0,0,0.8);
      color: white;
      padding: 10px;
      font-family: monospace;
      font-size: 12px;
      z-index: 999999;
      pointer-events: none;
      border-radius: 4px;
    `;
    document.body.appendChild(this.debugOverlay);
    this.updateDebugOverlay();
  }

  private updateDebugOverlay() {
    if (!this.debugOverlay) return;
    
    const { x, y, overZone, inputType, velocity } = this.lastPointer;
    const vx = velocity?.x?.toFixed(1) ?? '0';
    const vy = velocity?.y?.toFixed(1) ?? '0';
    
    this.debugOverlay.innerHTML = `
      <div>Zone: <strong>${overZone}</strong></div>
      <div>Pos: ${x}, ${y}</div>
      <div>Input: ${inputType}</div>
      <div>Velocity: ${vx}, ${vy}</div>
      <div>Triggers: ${this.triggers.size}</div>
      <div>Cards: ${this.cards.size}</div>
    `;
  }

  private removeDebugOverlay() {
    if (this.debugOverlay) {
      this.debugOverlay.remove();
      this.debugOverlay = null;
    }
  }
}
