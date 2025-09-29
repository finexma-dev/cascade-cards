export { HoverKitProvider, type HoverKitContextValue } from './components/provider.js';
export { HoverCard, HoverCardTrigger, HoverCardContent } from './components/hover-card.js';
export { HoverTerm } from './components/hover-term.js';
export { HoverHighlighter } from './components/hover-highlighter.js';
export { HoverKitSlots } from './components/hover-slots.js';
export { useHoverKit, useHoverKitOptional } from './hooks/use-hoverkit.js';
export { useRenderedMarkdown } from './lib/render-markdown.js';

// Re-export core types for convenience
export type {
  DataSource,
  DataSourceContent,
  HoverKitConfig,
  CardState,
  HoverKitEvents
} from 'cascade-cards-core';
