'use client';

import React, { forwardRef, useEffect, useRef, useState, type HTMLAttributes } from 'react';
import * as HoverCardPrimitive from '@radix-ui/react-hover-card';
import { useHoverKit } from '../hooks/use-hoverkit.js';
import { cn } from '../lib/utils.js';
import { useRenderedMarkdown } from '../lib/render-markdown.js';
import { HoverTerm } from './hover-term.js';
import type { DataSourceContent } from 'cascade-cards-core';

const HoverCard = HoverCardPrimitive.Root;
const HoverCardTrigger = HoverCardPrimitive.Trigger;

interface HoverCardContentProps extends Omit<React.ComponentPropsWithoutRef<typeof HoverCardPrimitive.Content>, 'content'> {
  term?: string;
  cardContent?: DataSourceContent | null;
  onLinkClick?: (linkTerm: string, position: { x: number; y: number }) => void;
}

const HoverCardContent = forwardRef<
  React.ElementRef<typeof HoverCardPrimitive.Content>,
  HoverCardContentProps
>(({ className, term, cardContent, onLinkClick, children, ...props }, ref) => {
  const { engine, openCard } = useHoverKit();
  const [resolvedContent, setResolvedContent] = useState<DataSourceContent | null>(cardContent || null);
  const [isLoading, setIsLoading] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const renderedMarkdown = useRenderedMarkdown(resolvedContent?.markdown);

  // Load content if term is provided but no content
  useEffect(() => {
    if (term && !cardContent && !resolvedContent) {
      setIsLoading(true);
      
      // Resolve content through the engine's sources
      const loadContent = async () => {
        try {
          // Get sources from the engine
          const sources = engine.getSources();
          for (const source of sources) {
            try {
              const result = await source.resolve(term);
              if (result) {
                setResolvedContent(result);
                break;
              }
            } catch (error) {
              console.warn(`Source "${source.name}" failed:`, error);
            }
          }
        } catch (error) {
          console.error('Failed to load content:', error);
        } finally {
          setIsLoading(false);
        }
      };

      loadContent();
    }
  }, [term, cardContent, resolvedContent, engine]);

  const handleLinkClick = (linkTerm: string, event: React.MouseEvent) => {
    event.preventDefault();
    const mouseX = event.clientX;
    const mouseY = event.clientY;
    onLinkClick?.(linkTerm, { x: mouseX, y: mouseY });
  };

  // Attach hover behavior using event delegation
  useEffect(() => {
    if (!engine || !contentRef.current || !resolvedContent) return;
    
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
      
      const mouseX = (e as MouseEvent).clientX;
      const mouseY = (e as MouseEvent).clientY;
      
      try { console.debug('[HoverKit] Delegated hover over term in card:', term); } catch {}
      const timer = window.setTimeout(() => {
        openCard(term, target, { x: mouseX, y: mouseY });
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
      
      const mouseX = (e as MouseEvent).clientX;
      const mouseY = (e as MouseEvent).clientY;
      openCard(term, target, { x: mouseX, y: mouseY });
    };
    
    // Use event delegation on the container
    container.addEventListener('mouseover', handleMouseOver);
    container.addEventListener('mouseout', handleMouseOut);
    container.addEventListener('click', handleClick);
    
    // Cleanup
    return () => {
      container.removeEventListener('mouseover', handleMouseOver);
      container.removeEventListener('mouseout', handleMouseOut);
      container.removeEventListener('click', handleClick);
      hoverTimers.forEach(timer => window.clearTimeout(timer));
    };
  }, [engine, resolvedContent]);

  useEffect(() => {
    if (!engine || !resolvedContent) return;
    resolvedContent.links?.forEach(link => {
      engine.addTerm(link.term);
      link.label && engine.addTerm(link.label);
    });
  }, [engine, resolvedContent]);

  const renderContent = () => {
    if (children) return children;
    
    if (isLoading) {
      return (
        <div className="flex items-center justify-center p-2">
          <div className="animate-spin h-3 w-3 border-2 border-muted-foreground/20 border-t-muted-foreground rounded-full" />
          <span className="ml-2 text-xs text-muted-foreground">Loading...</span>
        </div>
      );
    }

    if (!resolvedContent) {
      return (
        <div className="text-xs text-muted-foreground">
          No content available for "{term}"
        </div>
      );
    }

    const handleContentClick = (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'A') {
        e.preventDefault();
        const href = target.getAttribute('href');
        if (href && href.startsWith('#')) {
          const linkTerm = href.substring(1);
          onLinkClick?.(linkTerm, { x: e.clientX, y: e.clientY });
        }
      }
    };

    return (
      <div className="space-y-2">
        <h3 className="font-semibold text-sm">{resolvedContent.title}</h3>
        
        {resolvedContent.markdown && (
          <div 
            className="space-y-2 text-xs text-muted-foreground [&>h1]:text-sm [&>h1]:font-semibold [&>h1]:mb-1 [&>h1]:text-foreground [&>h2]:text-xs [&>h2]:font-semibold [&>h2]:mb-1 [&>h2]:text-foreground [&>h3]:text-xs [&>h3]:font-semibold [&>h3]:mb-1 [&_strong]:font-semibold [&_strong]:text-foreground"
            onClick={handleContentClick}
            ref={contentRef}
          >
            {renderedMarkdown}
          </div>
        )}

        {resolvedContent.links && resolvedContent.links.length > 0 && (
          <div className="border-t pt-2 mt-2">
            <p className="text-[10px] font-medium text-muted-foreground mb-1">See also:</p>
            <div className="flex flex-wrap gap-1">
              {resolvedContent.links.map((link, index) => (
                <HoverTerm
                  key={index}
                  term={link.term}
                  className="text-[10px] px-1.5 py-0.5 bg-primary/10 hover:bg-primary/20 text-primary rounded transition-colors font-medium"
                >
                  {link.label || link.term}
                </HoverTerm>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <HoverCardPrimitive.Portal>
      <HoverCardPrimitive.Content
        ref={ref}
        className={cn(
          'z-50 w-64 max-w-[90vw] rounded-2xl border-none bg-transparent p-0 outline-none shadow-none',
          'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-4 data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
          className
        )}
        sideOffset={12}
        {...props}
      >
        <div className="relative z-50 w-full rounded-2xl border-none outline-none transition-all duration-200" style={{ backfaceVisibility: 'hidden', transform: 'translateZ(0)' }}>
          <div className="relative overflow-hidden rounded-[inherit] border-0 bg-gradient-to-b from-slate-950/95 via-slate-950/90 to-slate-950/95 backdrop-blur-xl">
            <div className="absolute inset-0 opacity-0 transition-opacity duration-300 hover:opacity-100" aria-hidden>
              <div className="absolute -inset-24 bg-gradient-to-r from-purple-500/25 via-pink-500/20 to-sky-500/25 blur-3xl" />
            </div>
            <div className="relative space-y-3 p-5 text-xs text-slate-300">
              {renderContent()}
            </div>
          </div>
        </div>
      </HoverCardPrimitive.Content>
    </HoverCardPrimitive.Portal>
  );
});

HoverCardContent.displayName = 'HoverCardContent';

export { HoverCard, HoverCardTrigger, HoverCardContent };
