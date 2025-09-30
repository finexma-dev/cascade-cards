import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  HoverEngine,
  type HoverKitConfig,
  type CardState,
  HoverBehaviorConfigSchema,
  HighlightingConfigSchema,
  AIConfigSchema,
  type HoverBehaviorConfig,
  type HighlightingConfig,
  type AIConfig,
} from 'cascade-cards-core';
import { CardStackPortal } from './card-stack-portal.js';
import { PointerEngine, type PointerState, type PointerZone } from '../lib/pointer-engine.js';

type CardAnimationState = 
  | 'entering'
  | 'idle' 
  | 'scheduled-close'
  | 'closing'
  | 'closed';

interface CardUIState {
  animationState: CardAnimationState;
  isPointerInside: boolean;
}

export interface HoverKitContextValue {
  engine: HoverEngine;
  cards: CardState[];
  cardUIStates: Map<string, CardUIState>;
  openCard: (term: string, element: HTMLElement, position: { x: number; y: number }, parentId?: string) => Promise<string>;
  closeCard: (cardId: string) => void;
  followLink: (linkTerm: string, fromCardId: string, position: { x: number; y: number }) => Promise<string | null>;
  registerActiveTrigger: (element: HTMLElement, term: string) => void;
  unregisterActiveTrigger: (element: HTMLElement) => void;
  registerCardElement: (cardId: string, element: HTMLElement) => void;
  unregisterCardElement: (cardId: string) => void;
  getCardElement: (cardId: string) => HTMLElement | null;
  isScrollFading: boolean;
  cardInitialPopDelayMs: number;
  cardCascadePopDelayMs: number;
  cardFadeDurationMs: number;
  stackBehavior: HoverBehaviorConfig['stackBehavior'];
  stackOffsetPixels: HoverBehaviorConfig['stackOffsetPixels'];
  showCloseButton?: boolean;
}

export const HoverKitContext = createContext<HoverKitContextValue | null>(null);

interface HoverKitProviderProps {
  children: ReactNode;
  sources: HoverKitConfig['sources'];
  behavior?: Partial<HoverBehaviorConfig>;
  highlighting?: Partial<HighlightingConfig>;
  ai?: Partial<AIConfig>;
}

export function HoverKitProvider({
  children,
  sources,
  behavior,
  highlighting,
  ai,
}: HoverKitProviderProps) {
  const engineRef = useRef<HoverEngine | null>(null);
  const pointerEngineRef = useRef<PointerEngine | null>(null);
  const [cards, setCards] = useState<CardState[]>([]);
  const [cardAnimations, setCardAnimations] = useState<Map<string, CardAnimationState>>(new Map());
  const [pointerState, setPointerState] = useState<PointerState>({
    x: -1,
    y: -1,
    overZone: 'none',
    timestamp: Date.now(),
    inputType: 'mouse'
  });
  const pointerZoneRef = useRef<PointerZone>('none');
  const closeTimerRef = useRef<number | null>(null);
  const closingAnimationTimerRef = useRef<number | null>(null);
  const openGraceUntilRef = useRef<number>(0);
  const pointerOverStackRef = useRef(false);
  const hasCascadedRef = useRef(false);
  const cardElementsRef = useRef<Map<string, HTMLElement>>(new Map());
  const cardsRef = useRef<CardState[]>([]);
  
  const scrollFadeTimerRef = useRef<number | null>(null);
  const [isScrollFading, setIsScrollFading] = useState(false);

  // Timing configuration
  const cardInitialPopDelayMs = behavior?.cardInitialPopDelayMs ?? 500;
  const cardCascadePopDelayMs = behavior?.cardCascadePopDelayMs ?? 3000;
  const cardFadeDurationMs = behavior?.cardFadeDurationMs ?? 200;

  const CARD_WIDTH = 256;
  const CARD_HEIGHT = 400;
  const ROOT_EDGE_PADDING = 1; // 1px gap under the trigger for the first card

  const config = useMemo<HoverKitConfig>(() => ({
    sources,
    behavior: HoverBehaviorConfigSchema.parse(behavior ?? {}),
    highlighting: HighlightingConfigSchema.parse(highlighting ?? {}),
    ai: AIConfigSchema.parse(ai ?? {}),
  }), [sources, behavior, highlighting, ai]);

  if (!engineRef.current) {
    engineRef.current = new HoverEngine(config);
  } else {
    engineRef.current.updateConfig(config);
  }

  const engine = engineRef.current;

  // Ensure ALL root card opens (including those initiated inside core highlight listeners)
  // compute their position below the trigger element. We monkey-patch once.
  useEffect(() => {
    if (!engine) return;
    const anyEngine = engine as unknown as { __openPatched?: boolean } & HoverEngine;
    if (anyEngine.__openPatched) return;

    const originalOpenCard = engine.openCard.bind(engine);
    (engine as any).__openPatched = true;
    (engine as any).openCard = async (
      term: string,
      element: HTMLElement,
      position: { x: number; y: number },
      parentId?: string
    ) => {
      let nextPosition = position;
      if (!parentId && element) {
        nextPosition = computeRootCardPosition(element, position);
      }
      return originalOpenCard(term, element, nextPosition, parentId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  // Helper to find top card in stack
  const getTopCard = useCallback(() => {
    const sortedCards = [...cards].sort((a, b) => {
      // Sort by level first, then by ID (newer cards have higher IDs)
      if (b.level !== a.level) return b.level - a.level;
      return b.id.localeCompare(a.id);
    });
    return sortedCards[0];
  }, [cards]);

  // Keep cardsRef in sync with cards state
  useEffect(() => {
    cardsRef.current = cards;
  }, [cards]);

  // Initialize pointer engine with a live top-card resolver using cardsRef
  useEffect(() => {
    if (!pointerEngineRef.current) {
      const pointerEngine = new PointerEngine({ debug: false });
      pointerEngineRef.current = pointerEngine;

      // Live resolver reading from cardsRef to avoid stale closures
      pointerEngine.getTopCardId = () => {
        const list = cardsRef.current;
        if (!list || list.length === 0) return null;
        const sorted = [...list].sort((a, b) => {
          if (b.level !== a.level) return b.level - a.level;
          return b.id.localeCompare(a.id);
        });
        return sorted[0]?.id ?? null;
      };

      // Subscribe to pointer state changes
      pointerEngine.subscribe(setPointerState);
      pointerEngine.start();
    }

    return () => {
      if (pointerEngineRef.current) {
        pointerEngineRef.current.stop();
        pointerEngineRef.current = null;
      }
    };
  }, []);

  // Schedule card close with animation
  const scheduleTopCardClose = useCallback((delay: number) => {
    setIsScrollFading(false);
    const topCard = getTopCard();
    if (!topCard) return;

    // Clear any existing timer
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
    }

    if (scrollFadeTimerRef.current) {
      clearTimeout(scrollFadeTimerRef.current);
      scrollFadeTimerRef.current = null;
    }

    // Update animation state to scheduled-close
    setCardAnimations(prev => {
      const newStates = new Map(prev);
      newStates.set(topCard.id, 'scheduled-close');
      return newStates;
    });

    // Schedule the actual close
    closeTimerRef.current = window.setTimeout(() => {
      requestAnimationFrame(() => {
        // Start closing animation
        setCardAnimations(prev => {
          const newStates = new Map(prev);
          newStates.set(topCard.id, 'closing');
          return newStates;
        });

        // Remove card after animation completes
        closingAnimationTimerRef.current = window.setTimeout(() => {
          engine.closeCard(topCard.id);
          closeTimerRef.current = null;
          closingAnimationTimerRef.current = null;
          hasCascadedRef.current = true;
        }, cardFadeDurationMs);
      });
    }, delay);
  }, [engine, cardFadeDurationMs, getTopCard]);

  const closeTopCardNow = useCallback(() => {
    setIsScrollFading(false);
    const topCard = getTopCard();
    if (!topCard) return;

    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    if (scrollFadeTimerRef.current) {
      clearTimeout(scrollFadeTimerRef.current);
      scrollFadeTimerRef.current = null;
    }

    setCardAnimations(prev => {
      const newStates = new Map(prev);
      newStates.set(topCard.id, 'closing');
      return newStates;
    });

    hasCascadedRef.current = true;

    window.setTimeout(() => {
      engine.closeCard(topCard.id);
    }, Math.max(0, Math.min(cardFadeDurationMs, 75)) || 0);
  }, [engine, getTopCard, cardFadeDurationMs]);

  const closeAllCardsNow = useCallback(() => {
    if (cardsRef.current.length === 0) {
      return;
    }

    setIsScrollFading(true);

    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    if (scrollFadeTimerRef.current) {
      clearTimeout(scrollFadeTimerRef.current);
      scrollFadeTimerRef.current = null;
    }

    const ids = cardsRef.current.map(card => card.id);

    setCardAnimations(prev => {
      const newStates = new Map(prev);
      ids.forEach(id => newStates.set(id, 'closing'));
      return newStates;
    });

    hasCascadedRef.current = true;

    const delay = Math.max(0, Math.min(cardFadeDurationMs, 75)) || 0;
    window.setTimeout(() => {
      ids.forEach(id => {
        engine.closeCard(id);
      });
    }, delay);
  }, [engine, cardFadeDurationMs]);

  // Cancel scheduled close
  const cancelTopCardClose = useCallback(() => {
    setIsScrollFading(false);
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;

      const topCard = getTopCard();
      if (topCard) {
        setCardAnimations(prev => {
          const newStates = new Map(prev);
          const state = newStates.get(topCard.id);
          if (state === 'scheduled-close' || state === 'closing') {
            newStates.set(topCard.id, 'idle');
          }
          return newStates;
        });
      }
    }

    if (closingAnimationTimerRef.current) {
      clearTimeout(closingAnimationTimerRef.current);
      closingAnimationTimerRef.current = null;
      const topCard = getTopCard();
      if (topCard) {
        setCardAnimations(prev => {
          const newStates = new Map(prev);
          const state = newStates.get(topCard.id);
          if (state === 'closing') {
            newStates.set(topCard.id, 'idle');
          }
          return newStates;
        });
      }
    }

    if (scrollFadeTimerRef.current) {
      clearTimeout(scrollFadeTimerRef.current);
      scrollFadeTimerRef.current = null;
    }
  }, [getTopCard]);

  // React to pointer state changes
  useEffect(() => {
    const topCard = getTopCard();
    if (!topCard) {
      hasCascadedRef.current = false;
      return;
    }

    const animState = cardAnimations.get(topCard.id) || 'idle';

    pointerOverStackRef.current = pointerState.overZone !== 'none';

    // Grace period after open to prevent flicker as pointer moves
    const now = Date.now();
    if (now < openGraceUntilRef.current) {
      cancelTopCardClose();
      return;
    }

    if (pointerOverStackRef.current) {
      cancelTopCardClose();
      hasCascadedRef.current = false;
      return;
    }

    // If pointer is not in a safe zone and card is idle, schedule close
    if (pointerState.overZone === 'none' && animState === 'idle') {
      const delay = hasCascadedRef.current ? cardCascadePopDelayMs : cardInitialPopDelayMs;
      scheduleTopCardClose(delay);
    }
  }, [pointerState, getTopCard, cardAnimations, cancelTopCardClose, scheduleTopCardClose, cardInitialPopDelayMs, cardCascadePopDelayMs]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      
      // Don't close if pointer is over a card or a hover term
      const target = event.target as HTMLElement;
      const isOverCard = target.closest('[data-card-id]');
      const isOverHoverTerm = target.closest('[data-hover-term]') || target.closest('[data-cascade-term]');
      
      if (isOverCard || isOverHoverTerm) {
        return;
      }
      
      closeTopCardNow();
    };

    const handleScroll = () => {
      closeAllCardsNow();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeTopCardNow();
      }
    };

    window.addEventListener('pointerdown', handlePointerDown, { passive: true });
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeTopCardNow, closeAllCardsNow]);

  useEffect(() => {
    const handleCardOpen = (card: CardState) => {
      setIsScrollFading(false);
      // Start grace window for pointer stabilization
      openGraceUntilRef.current = Date.now() + 250;
      setCards(prev => {
        const updated = prev.map(c => (c.id === card.id ? card : c));
        if (!prev.some(c => c.id === card.id)) {
          updated.push(card);
        }
        cardsRef.current = updated;
        return updated;
      });

    if (scrollFadeTimerRef.current) {
      clearTimeout(scrollFadeTimerRef.current);
      scrollFadeTimerRef.current = null;
    }

      hasCascadedRef.current = false;

      // Initialize animation state for new card
      setCardAnimations(prev => {
        const newStates = new Map(prev);
        if (!newStates.has(card.id)) {
          newStates.set(card.id, pointerOverStackRef.current ? 'idle' : 'entering');
          if (!pointerOverStackRef.current) {
            // Transition to idle after enter animation
            setTimeout(() => {
              setCardAnimations(prev2 => {
                const newStates2 = new Map(prev2);
                if (newStates2.get(card.id) === 'entering') {
                  newStates2.set(card.id, 'idle');
                }
                return newStates2;
              });
            }, 500); // Match enter animation duration
          }
        }
        return newStates;
      });

      // Re-evaluate pointer zones now that a card appeared
      if (pointerEngineRef.current && (pointerEngineRef.current as any).forceCheckPointerZone) {
        (pointerEngineRef.current as any).forceCheckPointerZone();
      }
    };

    const handleCardClose = (cardId: string) => {
      setIsScrollFading(false);
      setCards(prev => {
        const updated = prev.filter(c => c.id !== cardId);
        cardsRef.current = updated;
        return updated;
      });
      if (scrollFadeTimerRef.current) {
        clearTimeout(scrollFadeTimerRef.current);
        scrollFadeTimerRef.current = null;
      }
      setCardAnimations(prev => {
        const newStates = new Map(prev);
        newStates.delete(cardId);
        return newStates;
      });
      
      // Unregister card element if it exists
      const element = cardElementsRef.current.get(cardId);
      if (element && pointerEngineRef.current) {
        pointerEngineRef.current.unregisterCard(element);
        cardElementsRef.current.delete(cardId);
      }

      // Re-evaluate pointer zones after state updates
      setTimeout(() => {
        if (pointerEngineRef.current && (pointerEngineRef.current as any).forceCheckPointerZone) {
          (pointerEngineRef.current as any).forceCheckPointerZone();
        }
      }, 0);
    };

    engine.on('cardOpen', handleCardOpen);
    engine.on('cardClose', handleCardClose);

    return () => {
      engine.off('cardOpen', handleCardOpen);
      engine.off('cardClose', handleCardClose);
    };
  }, [engine]);

  // Register/unregister elements with pointer engine
  const registerActiveTrigger = useCallback((element: HTMLElement, term: string) => {
    pointerEngineRef.current?.registerTrigger(element, term);
  }, []);

  const unregisterActiveTrigger = useCallback((element: HTMLElement) => {
    if (pointerEngineRef.current) {
      pointerEngineRef.current.unregisterTrigger(element);
    }
  }, []);

  const registerCardElement = useCallback((cardId: string, element: HTMLElement) => {
    cardElementsRef.current.set(cardId, element);
    if (pointerEngineRef.current) {
      pointerEngineRef.current.registerCard(element, cardId);
    }
  }, []);

  const unregisterCardElement = useCallback((cardId: string) => {
    const element = cardElementsRef.current.get(cardId);
    if (element && pointerEngineRef.current) {
      pointerEngineRef.current.unregisterCard(element);
    }
    cardElementsRef.current.delete(cardId);
  }, []);

  const getCardElement = useCallback((cardId: string) => {
    return cardElementsRef.current.get(cardId) ?? null;
  }, []);

  // Create backward-compatible UI states from animation states
  const cardUIStates = useMemo(() => {
    const uiStates = new Map<string, CardUIState>();
    cards.forEach(card => {
      const animState = cardAnimations.get(card.id) || 'idle';
      uiStates.set(card.id, {
        animationState: animState,
        isPointerInside: pointerState.overZone === 'top-card' && getTopCard()?.id === card.id
      });
    });
    return uiStates;
  }, [cards, cardAnimations, pointerState, getTopCard]);

  const clamp = useCallback((value: number, min: number, max: number) => {
    return Math.max(min, Math.min(max, value));
  }, []);

  const computeRootCardPosition = useCallback((element: HTMLElement, fallback: { x: number; y: number }) => {
    if (typeof window === 'undefined') {
      return fallback;
    }

    const rect = element.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const targetX = rect.left + rect.width / 2;
    const targetY = rect.bottom + ROOT_EDGE_PADDING + CARD_HEIGHT / 2;

    const minX = ROOT_EDGE_PADDING + CARD_WIDTH / 2;
    const maxX = viewportWidth - ROOT_EDGE_PADDING - CARD_WIDTH / 2;
    const minY = ROOT_EDGE_PADDING + CARD_HEIGHT / 2;
    const maxY = viewportHeight - ROOT_EDGE_PADDING - CARD_HEIGHT / 2;

    return {
      x: clamp(targetX, minX, maxX),
      y: clamp(targetY, minY, maxY),
    };
  }, [ROOT_EDGE_PADDING, CARD_HEIGHT, CARD_WIDTH, clamp]);

  const contextValue: HoverKitContextValue = {
    engine,
    cards,
    cardUIStates,
    isScrollFading,
    cardInitialPopDelayMs,
    cardCascadePopDelayMs,
    cardFadeDurationMs,
    stackBehavior: config.behavior.stackBehavior,
    stackOffsetPixels: config.behavior.stackOffsetPixels,
    showCloseButton: config.behavior.showCloseButton,
    openCard: async (term, element, position, parentId) => {
      // Engine's openCard is patched to compute root position when parentId is undefined
      return engine.openCard(term, element, position, parentId);
    },
    closeCard: (cardId) => {
      engine.closeCard(cardId);
    },
    followLink: async (linkTerm, fromCardId, position) => {
      return engine.followLink(linkTerm, fromCardId, position);
    },
    registerActiveTrigger,
    unregisterActiveTrigger,
    registerCardElement,
    unregisterCardElement,
    getCardElement,
  };

  return (
    <HoverKitContext.Provider value={contextValue}>
      {children}
      <CardStackPortal />
    </HoverKitContext.Provider>
  );
}
