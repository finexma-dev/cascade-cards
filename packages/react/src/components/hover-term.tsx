import React, { forwardRef, useEffect, useRef, type ReactNode } from 'react';
import { useHoverKit } from '../hooks/use-hoverkit.js';
import { cn } from '../lib/utils.js';

interface HoverTermProps {
  term: string;
  children: ReactNode;
  className?: string;
  variant?: 'default' | 'glow' | 'minimal' | 'pill';
  disableDelay?: boolean;
}

const HoverTerm = forwardRef<HTMLSpanElement, HoverTermProps>(
  ({ term, children, className, variant = 'default', disableDelay = false, ...props }, ref) => {
    const { openCard, registerActiveTrigger, unregisterActiveTrigger } = useHoverKit();
    const localRef = useRef<HTMLSpanElement | null>(null);
    const timerRef = useRef<number | null>(null);

    const variantStyles = {
      default: cn(
        'relative inline-block px-1.5 py-0.5 rounded-md bg-gradient-to-r from-purple-500/15 via-pink-500/10 to-sky-500/15',
        'border border-purple-500/30 text-purple-200 font-medium cursor-help transition-all duration-200',
        'hover:from-purple-500/20 hover:via-pink-500/15 hover:to-sky-500/20 hover:border-purple-400/40 hover:shadow-[0_0_12px_rgba(168,85,247,0.35)]'
      ),
      glow: cn(
        'relative inline-block px-2 py-1 rounded-lg cursor-help font-semibold text-purple-100',
        'bg-gradient-to-r from-purple-600/25 via-pink-600/20 to-sky-500/20 border border-transparent backdrop-blur-sm',
        'shadow-[0_0_18px_rgba(168,85,247,0.25)] transition-all duration-300 hover:shadow-[0_0_30px_rgba(168,85,247,0.45)]',
        'before:absolute before:inset-0 before:rounded-lg before:bg-gradient-to-r before:from-purple-500 before:via-pink-500 before:to-sky-400 before:opacity-0 hover:before:opacity-20 before:blur-xl before:transition-opacity before:duration-300'
      ),
      minimal: cn(
        'inline-block border-b border-dashed border-purple-400/60 text-purple-200 cursor-help',
        'hover:text-purple-100 hover:border-purple-300 transition-colors duration-200'
      ),
      pill: cn(
        'inline-block px-3 py-1 rounded-full text-sm font-medium cursor-help',
        'bg-gradient-to-r from-slate-900/80 to-slate-900/60 border border-purple-500/25 text-purple-200',
        'shadow-[0_10px_30px_-20px_rgba(168,85,247,0.45)] hover:border-purple-500/45 hover:shadow-[0_12px_35px_-20px_rgba(168,85,247,0.6)] transition-all duration-200'
      )
    } satisfies Record<NonNullable<HoverTermProps['variant']>, string>;

    const openAtPosition = (x: number, y: number) => {
      if (!localRef.current) {
        return;
      }

      openCard(term, localRef.current, { x, y });
    };

    const handleMouseEnter = (e: React.MouseEvent<HTMLSpanElement>) => {
      if (!localRef.current) {
        return;
      }

      // Use mouse position directly; CSS handles centering
      const x = e.clientX;
      const y = e.clientY;

      const open = () => openAtPosition(x, y);

      if (disableDelay) {
        open();
        return;
      }

      timerRef.current = window.setTimeout(() => {
        open();
      }, 250);
    };

    const handleMouseLeave = () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const handleClick = (e: React.MouseEvent<HTMLSpanElement>) => {
      if (!localRef.current) {
        return;
      }

      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      openAtPosition(e.clientX, e.clientY);
    };

    const handleTouchEnd = (e: React.TouchEvent<HTMLSpanElement>) => {
      if (!localRef.current) return;

      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      const touch = e.changedTouches[0];
      if (!touch) return;
      openAtPosition(touch.clientX, touch.clientY);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLSpanElement>) => {
      if (!localRef.current) return;

      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const rect = localRef.current.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.bottom;
        openAtPosition(x, y);
      }
    };

    useEffect(() => {
      const el = localRef.current;
      if (el) {
        registerActiveTrigger(el, term);
        return () => {
          unregisterActiveTrigger(el);
        };
      }
    }, [term, registerActiveTrigger, unregisterActiveTrigger]);

    return (
      <span
        ref={(node) => {
          localRef.current = node;
          if (typeof ref === 'function') ref(node);
          else if (ref) (ref as React.MutableRefObject<HTMLSpanElement | null>).current = node;
        }}
        className={cn(
          'cursor-help inline-block',
          variantStyles[variant],
          className
        )}
        data-hover-term={term}
        data-cascade-term
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onTouchEnd={handleTouchEnd}
        tabIndex={0}
        role="button"
        aria-haspopup="dialog"
        aria-label={typeof children === 'string' ? `Learn more about ${children}` : `Learn more about ${term}`}
        {...props}
      >
        {children}
      </span>
    );
  }
);

HoverTerm.displayName = 'HoverTerm';

export { HoverTerm };
