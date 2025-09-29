import type { 
  DataSource, 
  DataSourceContent, 
  HoverKitConfig, 
  CardState, 
  HoverKitEvents,
  TermMatch 
} from './types.js';
import { TermMatcher } from './term-matcher.js';

export class HoverEngine {
  private config: HoverKitConfig;
  private termMatcher: TermMatcher;
  private cards: Map<string, CardState> = new Map();
  private dwellTimers: Map<string, number> = new Map();
  private eventHandlers: { [K in keyof HoverKitEvents]: HoverKitEvents[K][] };
  private cardIdCounter = 0;

  constructor(config: HoverKitConfig) {
    this.config = config;
    this.termMatcher = new TermMatcher(config.highlighting);
    this.eventHandlers = {
      cardOpen: [],
      cardClose: [],
      cardPin: [],
      cardUnpin: [],
      termHover: [],
      termLeave: [],
    };
    this.initializeTerms();
  }

  updateConfig(config: HoverKitConfig): void {
    this.config = config;
    this.termMatcher = new TermMatcher(config.highlighting);
    this.initializeTerms();
  }

  // Event handling
  on<K extends keyof HoverKitEvents>(event: K, handler: HoverKitEvents[K]): void {
    (this.eventHandlers[event] as any[]).push(handler);
  }

  off<K extends keyof HoverKitEvents>(event: K, handler: HoverKitEvents[K]): void {
    (this.eventHandlers[event] as any[]) = this.eventHandlers[event].filter((h: any) => h !== handler);
  }

  private emit<K extends keyof HoverKitEvents>(event: K, ...args: Parameters<HoverKitEvents[K]>): void {
    const handlers = this.eventHandlers[event] as any[];
    if (handlers.length === 0) return;
    handlers.forEach((handler: any) => {
      handler(...args);
    });
  }

  // Term management
  private async initializeTerms(): Promise<void> {
    // Pre-populate terms from data sources if they support it
    for (const source of this.config.sources) {
      // For now, we'll populate terms on-demand
      // TODO: Add optional getTerms() method to DataSource interface
    }
  }

  addTerm(term: string, aliases?: string[]): void {
    this.termMatcher.addTerm(term, aliases);
  }

  // Highlighting
  highlightElement(element: HTMLElement): TermMatch[] {
    const matches = this.termMatcher.findMatches(element);
    
    // Apply highlighting to matched terms
    matches.forEach(match => this.applyHighlighting(match));
    
    return matches;
  }

  private applyHighlighting(match: TermMatch): void {
    const { term, start, end, element } = match;
    const textNode = this.findTextNode(element, start, end);
    
    if (!textNode) return;

    // Create highlighted span
    const span = document.createElement('span');
    span.className = this.config.highlighting.className;
    span.setAttribute('data-hoverkit-term', term);
    span.setAttribute('data-hoverkit-match', 'true');
    
    // Split text node and wrap the term
    const text = textNode.textContent || '';
    const before = text.slice(0, start);
    const termText = text.slice(start, end);
    const after = text.slice(end);
    
    span.textContent = termText;
    
    // Replace text node with highlighted version
    const parent = textNode.parentNode!;
    if (before) parent.insertBefore(document.createTextNode(before), textNode);
    parent.insertBefore(span, textNode);
    if (after) parent.insertBefore(document.createTextNode(after), textNode);
    parent.removeChild(textNode);

    // Add event listeners
    this.attachHoverListeners(span, term);
  }

  private findTextNode(element: HTMLElement, start: number, end: number): Text | null {
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null
    );

    let currentPos = 0;
    let node: Text | null;
    
    while ((node = walker.nextNode() as Text)) {
      const text = node.textContent || '';
      const nodeEnd = currentPos + text.length;
      
      if (start >= currentPos && end <= nodeEnd) {
        return node;
      }
      
      currentPos = nodeEnd;
    }
    
    return null;
  }

  // Hover behavior
  private attachHoverListeners(element: HTMLElement, term: string): void {
    let isHovering = false;

    const onMouseEnter = (e: MouseEvent) => {
      isHovering = true;
      this.emit('termHover', term, element);
      this.startDwellTimer(term, element, e);
    };

    const onMouseLeave = (e: MouseEvent) => {
      isHovering = false;
      this.emit('termLeave', term, element);
      this.clearDwellTimer(term);
      
      // Don't close card immediately if user is moving to the card
      setTimeout(() => {
        if (!isHovering && !this.isHoveringCard(term)) {
          this.closeUnpinnedCard(term);
        }
      }, 100);
    };

    const onClick = () => {
      // Mobile fallback - click to pin
      this.pinCard(term, element);
    };

    element.addEventListener('mouseenter', onMouseEnter);
    element.addEventListener('mouseleave', onMouseLeave);
    element.addEventListener('click', onClick);

    // Store cleanup handlers
    element.setAttribute('data-hoverkit-listeners', 'true');
  }

  private startDwellTimer(term: string, element: HTMLElement, event: MouseEvent): void {
    this.clearDwellTimer(term);
    
    const timer = window.setTimeout(() => {
      // Use mouse position directly - CSS transform will center it
      const x = event.clientX;
      const y = event.clientY;

      console.log('Engine dwell - mouse position:', x, y);
      
      this.openCard(term, element, { x, y });
    }, this.config.behavior.pinOnHoverDelayMs);
    
    this.dwellTimers.set(term, timer);
  }

  private clearDwellTimer(term: string): void {
    const timer = this.dwellTimers.get(term);
    if (timer) {
      window.clearTimeout(timer);
      this.dwellTimers.delete(term);
    }
  }

  // Card management
  async openCard(term: string, triggerElement: HTMLElement, position: { x: number; y: number }, parentId?: string): Promise<string> {
    // Check if we've hit the max card limit
    const openCards = Array.from(this.cards.values()).filter(card => card.isPinned || card.isLoading);
    if (openCards.length >= this.config.behavior.maxOpenCards) {
      // Build ancestor chain for the new card; never prune ancestors
      const ancestorIds = new Set<string>();
      let current = parentId;
      while (current) {
        ancestorIds.add(current);
        current = this.cards.get(current)?.parentId;
      }

      // Close the oldest non-ancestor card by open time (FIFO)
      const candidates = openCards.filter(c => !ancestorIds.has(c.id));
      const byOpened = candidates.sort((a, b) => (a.openedAt ?? 0) - (b.openedAt ?? 0));
      const toClose = byOpened[0] ?? null;

      // As a last resort, if every card is an ancestor (rare), skip pruning
      if (toClose) {
        this.closeCard(toClose.id);
      }
    }

    const cardId = this.generateCardId();
    const level = parentId ? (this.cards.get(parentId)?.level || 0) + 1 : 0;

    const card: CardState = {
      id: cardId,
      term,
      content: null,
      position,
      isPinned: true,
      isLoading: true,
      parentId,
      level,
      openedAt: Date.now()
    };

    this.cards.set(cardId, card);
    this.emit('cardOpen', card);

    // Load content
    try {
      const content = await this.resolveContent(term);
      card.content = content;
      card.isLoading = false;
      this.emit('cardOpen', card); // Emit again with content
    } catch (error) {
      console.warn(`Failed to load content for term "${term}":`, error);
      card.isLoading = false;
      // Keep card open but with error state
      this.emit('cardOpen', card);
    }

    return cardId;
  }

  closeCard(cardId: string): void {
    const card = this.cards.get(cardId);
    if (!card) return;

    // Close any child cards first
    const childCards = Array.from(this.cards.values()).filter(c => c.parentId === cardId);
    childCards.forEach(child => this.closeCard(child.id));

    this.cards.delete(cardId);
    this.emit('cardClose', cardId);
  }

  private closeUnpinnedCard(term: string): void {
    const card = Array.from(this.cards.values()).find(c => c.term === term && !c.isPinned);
    if (card) {
      this.closeCard(card.id);
    }
  }

  pinCard(term: string, element: HTMLElement): void {
    // Find or create card for this term
    let card = Array.from(this.cards.values()).find(c => c.term === term);
    
    if (!card) {
      // Create new card at element position
      const rect = element.getBoundingClientRect();
      const CARD_WIDTH = 256;
      const CARD_HEIGHT = 400;
      const EDGE = 12;

      let x = rect.right + EDGE;
      let y = rect.top;
      if (x + CARD_WIDTH + EDGE > window.innerWidth) {
        x = Math.max(EDGE, rect.left - CARD_WIDTH - EDGE);
      }
      y = Math.max(EDGE, Math.min(window.innerHeight - CARD_HEIGHT - EDGE, y));

      this.openCard(term, element, { x, y });
    } else if (!card.isPinned) {
      card.isPinned = true;
      this.emit('cardPin', card.id);
    }
  }

  private isHoveringCard(term: string): boolean {
    // This would be implemented by the UI layer
    // For now, assume false
    return false;
  }

  // Content resolution
  private async resolveContent(term: string): Promise<DataSourceContent | null> {
    for (const source of this.config.sources) {
      try {
        const content = await source.resolve(term);
        if (content) {
          return content;
        }
      } catch (error) {
        console.warn(`Source "${source.name}" failed to resolve term "${term}":`, error);
        continue;
      }
    }
    return null;
  }

  // Navigation
  async followLink(linkTerm: string, fromCardId: string, position: { x: number; y: number }): Promise<string | null> {
    const parentCard = this.cards.get(fromCardId);
    if (!parentCard) return null;

    if (this.config.behavior.linkFollowInNewCard) {
      return this.openCard(linkTerm, document.body, position, fromCardId);
    } else {
      // Replace current card content
      parentCard.term = linkTerm;
      parentCard.content = null;
      parentCard.isLoading = true;
      this.emit('cardOpen', parentCard);

      try {
        const content = await this.resolveContent(linkTerm);
        parentCard.content = content;
        parentCard.isLoading = false;
        this.emit('cardOpen', parentCard);
      } catch (error) {
        console.warn(`Failed to load linked content for term "${linkTerm}":`, error);
        parentCard.isLoading = false;
        this.emit('cardOpen', parentCard);
      }

      return fromCardId;
    }
  }

  // Utilities
  private generateCardId(): string {
    return `hoverkit-card-${++this.cardIdCounter}`;
  }

  getSources(): DataSource[] {
    return this.config.sources;
  }

  getConfig(): HoverKitConfig {
    return this.config;
  }

  getCard(cardId: string): CardState | undefined {
    return this.cards.get(cardId);
  }

  getAllCards(): CardState[] {
    return Array.from(this.cards.values());
  }

  // Cleanup
  destroy(): void {
    // Clear all timers
    this.dwellTimers.forEach(timer => window.clearTimeout(timer));
    this.dwellTimers.clear();

    // Clear all cards
    this.cards.clear();

    // Clear term matcher
    this.termMatcher.clear();

    // Clear event handlers
    (Object.keys(this.eventHandlers) as Array<keyof HoverKitEvents>).forEach(event => {
      this.eventHandlers[event] = [];
    });
  }
}
