'use client';

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useHoverKit } from '../hooks/use-hoverkit.js';
import { useRenderedMarkdown } from '../lib/render-markdown.js';
import { cn } from '../lib/utils.js';
import { X } from 'lucide-react';

const CARD_WIDTH = 256;  // w-64 = 16rem = 256px
const CARD_HEIGHT = 400; // Typical card height
const EDGE_PADDING = 16;

export function CardStackPortal() {
  const { cards } = useHoverKit();

  return (
    <div className="fixed inset-0 pointer-events-none z-[60]">
      {cards.map((card) => (
        <StackedCard key={card.id} cardId={card.id} />
      ))}
    </div>
  );
}

function StackedCard({ cardId }: { cardId: string }) {
  const {
    engine,
    cards,
    cardUIStates,
    registerCardElement,
    unregisterCardElement,
    getCardElement,
    isScrollFading,
    stackBehavior,
    stackOffsetPixels,
    showCloseButton,
  } = useHoverKit();
  const card = engine.getCard(cardId);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const renderedMarkdown = useRenderedMarkdown(card?.content?.markdown);

  // Get UI state for this card
  const uiState = cardUIStates.get(cardId);
  const animationState = uiState?.animationState || 'idle';
  
  // Check if this is the top card
  const isTopCard = useMemo(() => {
    const sortedCards = [...cards].sort((a, b) => b.level - a.level);
    return sortedCards[0]?.id === cardId;
  }, [cards, cardId]);

  const computeStackOrigin = useCallback(() => {
    const topCard = [...cards].sort((a, b) => a.openedAt! - b.openedAt!)[0];
    if (!topCard) return null;
    const topCardElement = getCardElement(topCard.id);
    if (topCardElement) {
      const rect = topCardElement.getBoundingClientRect();
      return { x: rect.left, y: rect.top };
    }
    return { x: topCard.position.x, y: topCard.position.y };
  }, [cards, getCardElement]);

  const style = useMemo<React.CSSProperties>(() => {
    if (!card) return {};

    // Level 0 (root): positioned below trigger by provider
    // Level > 0 (stacked): use mouse position directly for origin, then apply small offset
    let x = card.position.x;
    let y = card.position.y;

    if (card.level > 0 && stackBehavior === 'spiral') {
      // Apply small offset from mouse position for stacking effect
      const offset = stackOffsetPixels * (card.level - 1);
      const angle = (card.level - 1) * 0.3;
      
      x = card.position.x + Math.cos(angle) * offset;
      y = card.position.y + Math.sin(angle) * offset;
    }

    // Viewport clamping - cards are max 50vh tall, 20rem wide
    const padding = 20;
    const cardWidth = Math.min(320, window.innerWidth * 0.9); // 20rem or 90vw
    const halfCardWidth = cardWidth / 2;
    const maxCardHeight = window.innerHeight * 0.5; // 50vh
    const halfCardHeight = maxCardHeight / 2;
    
    // Always keep cards fully on screen
    x = Math.max(padding + halfCardWidth, Math.min(window.innerWidth - (padding + halfCardWidth), x));
    y = Math.max(padding + halfCardHeight, Math.min(window.innerHeight - (padding + halfCardHeight), y));

    return {
      position: 'absolute',
      left: x,
      top: y,
      transform: 'translate(-50%, -50%)',
    };
  }, [card, stackBehavior, stackOffsetPixels]);

  // Register card element with pointer engine
  useEffect(() => {
    const el = cardRef.current;
    if (el) {
      registerCardElement(cardId, el);
      if (isTopCard) {
        requestAnimationFrame(() => {
          el.focus({ preventScroll: true });
        });
      }
      return () => {
        unregisterCardElement(cardId);
      };
    }
  }, [cardId, registerCardElement, unregisterCardElement, isTopCard]);

  useEffect(() => {
    if (!isTopCard || !cardRef.current) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        engine.closeCard(cardId);
      }
    };

    const element = cardRef.current;
    element.addEventListener('keydown', handleKeyDown);

    return () => {
      element.removeEventListener('keydown', handleKeyDown);
    };
  }, [engine, cardId, isTopCard]);

  useEffect(() => {
    if (!engine || !contentRef.current || !card?.content) return;
    
    const container = contentRef.current;
    const hoverTimers = new Map<HTMLElement, number>();
    let currentHoverTarget: HTMLElement | null = null;
    
    const handleMouseOver = (e: MouseEvent) => {
      const raw = e.target as Node;
      const baseEl = (raw && (raw as any).nodeType === 1) ? (raw as Element) : (raw as any)?.parentElement as Element | null;
      const target = baseEl?.closest?.('[data-hover-term]') as HTMLElement | null;
      if (!target || target === currentHoverTarget) return;

      // Clear any existing timer for the previous target
      if (currentHoverTarget) {
        const existingTimer = hoverTimers.get(currentHoverTarget);
        if (existingTimer) {
          window.clearTimeout(existingTimer);
          hoverTimers.delete(currentHoverTarget);
        }
      }

      currentHoverTarget = target;
      const term = target.getAttribute('data-hover-term');
      if (!term) return;

      const x = e.clientX;
      const y = e.clientY;

      try { console.debug('[HoverKit] Delegated hover over term in stacked card:', term, 'parent:', card.id); } catch {}
      const timer = window.setTimeout(() => {
        engine.openCard(term, target, { x, y }, card.id);
      }, 250);

      hoverTimers.set(target, timer);
    };
    
    const handleMouseOut = (e: MouseEvent) => {
      const raw = e.target as Node;
      const baseEl = (raw && (raw as any).nodeType === 1) ? (raw as Element) : (raw as any)?.parentElement as Element | null;
      const target = baseEl?.closest?.('[data-hover-term]') as HTMLElement | null;
      if (!target || target !== currentHoverTarget) return;
      
      // Check if we're still within the same hover term
      const relatedTarget = e.relatedTarget as HTMLElement;
      if (relatedTarget && target.contains(relatedTarget)) return;
      
      const timer = hoverTimers.get(target);
      if (timer) {
        window.clearTimeout(timer);
        hoverTimers.delete(target);
      }
      currentHoverTarget = null;
    };

    const handleClick = (e: MouseEvent) => {
      const raw = e.target as Node;
      const baseEl = (raw && (raw as any).nodeType === 1) ? (raw as Element) : (raw as any)?.parentElement as Element | null;
      const target = baseEl?.closest?.('[data-hover-term]') as HTMLElement | null;
      if (!target) return;

      e.preventDefault();
      const term = target.getAttribute('data-hover-term');
      if (!term) return;

      const x = e.clientX;
      const y = e.clientY;

      engine.openCard(term, target, { x, y }, card.id);
    };

    const handleTouchEnd = (e: TouchEvent) => {
      const raw = e.target as Node;
      const baseEl = (raw && (raw as any).nodeType === 1) ? (raw as Element) : (raw as any)?.parentElement as Element | null;
      const target = baseEl?.closest?.('[data-hover-term]') as HTMLElement | null;
      if (!target) return;

      // Clear any pending hover timer
      const timer = hoverTimers.get(target);
      if (timer) {
        window.clearTimeout(timer);
        hoverTimers.delete(target);
      }

      e.preventDefault();
      const term = target.getAttribute('data-hover-term');
      if (!term) return;

      const touch = e.changedTouches[0];
      if (!touch) return;

      const x = touch.clientX;
      const y = touch.clientY;

      try { console.debug('[HoverKit] Touch on term in stacked card:', term, 'parent:', card.id); } catch {}
      engine.openCard(term, target, { x, y }, card.id);
    };

    // Use event delegation on the container
    container.addEventListener('mouseover', handleMouseOver);
    container.addEventListener('mouseout', handleMouseOut);
    container.addEventListener('click', handleClick);
    container.addEventListener('touchend', handleTouchEnd);
    
    // Cleanup
    return () => {
      container.removeEventListener('mouseover', handleMouseOver);
      container.removeEventListener('mouseout', handleMouseOut);
      container.removeEventListener('click', handleClick);
      container.removeEventListener('touchend', handleTouchEnd);
      hoverTimers.forEach(timer => window.clearTimeout(timer));
    };
  }, [engine, card, computeStackOrigin]);

  if (!card) return null;

  return (
    <div 
      ref={cardRef}
      style={style} 
      className="pointer-events-auto cursor-default"
      data-card-id={cardId}
      role="dialog"
      aria-modal={isTopCard ? true : undefined}
      aria-label={card?.term ? `${card.term} reference` : undefined}
      tabIndex={-1}
    >
      <div 
        className={cn(
          'relative z-50 w-64 max-w-[90vw] rounded-2xl outline-none transition-all duration-300 ease-out',
          'before:absolute before:inset-0 before:-z-10 before:rounded-[inherit] before:bg-gradient-to-br before:from-purple-500/30 before:via-pink-500/20 before:to-sky-500/30 before:blur-2xl before:opacity-80',
          'shadow-[0_30px_80px_-40px_rgba(129,140,248,0.65)]',
          isTopCard && 'shadow-[0_40px_120px_-48px_rgba(147,197,253,0.9)]',
          animationState === 'entering' && (card.level === 0 ? 'animate-in fade-in-0 slide-in-from-top-3 duration-500' : 'animate-in fade-in-0 slide-in-from-top-3 duration-500'),
          animationState === 'closing' && 'animate-out fade-out-0',
          animationState === 'scheduled-close' && isTopCard && 'opacity-90',
          isScrollFading && 'opacity-0'
        )}
        style={{ backfaceVisibility: 'hidden', transform: 'translateZ(0)' }}
        data-stack-state={animationState}
        data-is-top={isTopCard}
      >
        <div className="relative overflow-hidden rounded-[inherit] border-0 bg-gradient-to-b from-slate-950/95 via-slate-950/90 to-slate-950/95 backdrop-blur-xl">
          <div className="absolute inset-0 opacity-0 transition-opacity duration-300 hover:opacity-100" aria-hidden>
            <div className="absolute -inset-24 bg-gradient-to-r from-purple-500/25 via-pink-500/20 to-sky-500/25 blur-3xl" />
          </div>

          {showCloseButton !== false && (
            <button
              type="button"
              onClick={() => engine.closeCard(cardId)}
              ref={closeButtonRef}
              className="absolute right-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-slate-300 transition-all duration-200 hover:bg-white/25 hover:text-white hover:border-white/20 hover:scale-110 active:scale-95 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 shadow-lg hover:shadow-xl"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          )}

          <div className="relative space-y-3 p-5">
            <h3 className="pr-10 text-sm font-semibold tracking-tight">
              <span className="bg-gradient-to-r from-purple-300 via-pink-300 to-sky-300 bg-clip-text text-transparent">
                {card.term}
              </span>
            </h3>

            {card.isLoading ? (
              <div className="hoverkit-card-loading flex items-center justify-center rounded-xl border border-white/5 bg-white/5 py-8">
                <span className="relative flex h-8 w-8">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gradient-to-r from-purple-400/50 via-pink-400/50 to-sky-400/50 opacity-75" />
                  <span className="relative inline-flex h-8 w-8 rounded-full bg-gradient-to-r from-purple-500 to-sky-400" />
                </span>
              </div>
            ) : card.content ? (
              <div
                ref={contentRef}
                className="hoverkit-card-content relative space-y-3 text-xs text-slate-300 [&>h1]:text-sm [&>h1]:font-semibold [&>h1]:mb-1 [&>h1]:text-white [&>h2]:text-xs [&>h2]:font-semibold [&>h2]:mb-1 [&>h2]:text-slate-100 [&>h3]:text-xs [&>h3]:font-semibold [&>h3]:mb-1 [&>h3]:text-slate-200 [&_strong]:font-semibold [&_strong]:text-slate-100"
              >
                {renderedMarkdown}
                <div className="pt-8" aria-hidden />
                <div className="hoverkit-fade-gradient pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-slate-950 via-slate-950/70 to-transparent" aria-hidden />
              </div>
            ) : (
              <div className="hoverkit-empty-state rounded-lg border border-white/5 bg-white/5 px-4 py-5 text-xs text-slate-400">
                No content available
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


