import { z } from 'zod';
import type { HoverEngine } from './hover-engine.js';

// Core data source interface
export const DataSourceContentSchema = z.object({
  title: z.string(),
  html: z.string().optional(),
  markdown: z.string().optional(),
  links: z.array(z.object({
    term: z.string(),
    label: z.string().optional(),
  })).optional(),
  meta: z.record(z.any()).optional(),
});

export type DataSourceContent = z.infer<typeof DataSourceContentSchema>;

export interface DataSource {
  name: string;
  resolve(term: string): Promise<DataSourceContent | null>;
}

// Hover behavior configuration
export const HoverBehaviorConfigSchema = z.object({
  pinOnHoverDelayMs: z.number().min(0).default(900),
  linkFollowInNewCard: z.boolean().default(true),
  maxOpenCards: z.number().min(1).default(20),
  closeOnEscape: z.boolean().default(true),
  closeOnClickOutside: z.boolean().default(true),
  cardInitialPopDelayMs: z.number().min(0).default(1000),
  cardCascadePopDelayMs: z.number().min(0).default(3000),
  cardFadeDurationMs: z.number().min(0).default(200),
  stackBehavior: z.enum(['spiral', 'cascade']).default('spiral'),
  stackOffsetPixels: z.number().min(0).default(20),
  showCloseButton: z.boolean().default(true),
});

export type HoverBehaviorConfig = z.infer<typeof HoverBehaviorConfigSchema>;

// Highlighting configuration
export const HighlightingConfigSchema = z.object({
  strategy: z.enum(['word-boundary', 'explicit-only']).default('word-boundary'),
  className: z.string().default('bg-amber-200/40 ring-amber-300'),
  caseSensitive: z.boolean().default(false),
  excludeSelectors: z.array(z.string()).default(['code', 'pre', 'input', 'textarea']),
});

export type HighlightingConfig = z.infer<typeof HighlightingConfigSchema>;

// AI configuration (optional)
export const AIConfigSchema = z.object({
  enabled: z.boolean().default(false),
  onAsk: z.function().args(z.object({
    term: z.string(),
    context: z.string(),
  })).returns(z.promise(z.object({
    answerHtml: z.string(),
  }))).optional(),
});

export type AIConfig = z.infer<typeof AIConfigSchema>;

// Overall provider configuration
export const HoverKitConfigSchema = z.object({
  sources: z.array(z.custom<DataSource>()),
  behavior: HoverBehaviorConfigSchema.default({}),
  highlighting: HighlightingConfigSchema.default({}),
  ai: AIConfigSchema.default({}),
});

export type HoverKitConfig = z.infer<typeof HoverKitConfigSchema>;

// Card state management
export interface CardState {
  id: string;
  term: string;
  content: DataSourceContent | null;
  position: { x: number; y: number };
  isPinned: boolean;
  isLoading: boolean;
  parentId?: string;
  level: number;
  openedAt?: number;
}

// Events
export interface HoverKitEvents {
  cardOpen: (card: CardState) => void;
  cardClose: (cardId: string) => void;
  cardPin: (cardId: string) => void;
  cardUnpin: (cardId: string) => void;
  termHover: (term: string, element: HTMLElement) => void;
  termLeave: (term: string, element: HTMLElement) => void;
}

// Term matching results
export interface TermMatch {
  term: string;
  start: number;
  end: number;
  element: HTMLElement;
  confidence: number;
}

export interface HoverKitContextValue {
  engine: HoverEngine;
  cards: CardState[];
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
}
