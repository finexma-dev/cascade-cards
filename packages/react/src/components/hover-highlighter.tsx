import React, { useEffect, useRef, type ReactNode } from 'react';
import { useHoverKit } from '../hooks/use-hoverkit.js';

interface HoverHighlighterProps {
  children: ReactNode;
  terms?: string[];
  className?: string;
  disabled?: boolean;
}

export function HoverHighlighter({ 
  children, 
  terms = [], 
  className,
  disabled = false 
}: HoverHighlighterProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { engine } = useHoverKit();
  const hasHighlightedRef = useRef(false);

  useEffect(() => {
    if (disabled || !containerRef.current || !engine) return;

    const container = containerRef.current;

    // Add terms to the engine's term matcher
    terms.forEach(term => {
      engine.addTerm(term);
    });

    // Only highlight once to prevent DOM manipulation flicker
    if (!hasHighlightedRef.current) {
      const timeoutId = setTimeout(() => {
        engine.highlightElement(container);
        hasHighlightedRef.current = true;
      }, 10);

      return () => {
        clearTimeout(timeoutId);
      };
    }
  }, [terms, disabled, engine]);

  return (
    <div 
      ref={containerRef} 
      className={className}
      data-hoverkit-highlighter="true"
    >
      {children}
    </div>
  );
}
