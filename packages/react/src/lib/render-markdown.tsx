import React, { useMemo } from 'react';
import { marked, type Tokens, type TokensList } from 'marked';

function slugifyAnchor(anchor: string): string {
  return anchor.trim().replace(/\s+/g, '-').toLowerCase();
}

function deslugifyTerm(term: string): string {
  try {
    term = decodeURIComponent(term);
  } catch {}
  return term.replace(/-/g, ' ').trim();
}

function preprocessMarkdown(markdown: string): string {
  // Convert [label](#anchor with spaces) -> [label](#anchor-with-spaces)
  return markdown.replace(/\[([^\]]+)\]\(#([^)]+)\)/g, (_m, text: string, anchor: string) => {
    const slug = slugifyAnchor(anchor);
    return `[${text}](#${slug})`;
  });
}

function renderInline(tokens?: TokensList | Tokens.Generic[], keyPrefix = ''): React.ReactNode {
  if (!tokens) return null;

  return tokens.map((token, index) => {
    const key = `${keyPrefix}-inline-${index}`;

    switch (token.type) {
      case 'text':
        if ('tokens' in token && token.tokens && token.tokens.length > 0) {
          return <React.Fragment key={key}>{renderInline(token.tokens, key)}</React.Fragment>;
        }
        return <React.Fragment key={key}>{token.text}</React.Fragment>;
      case 'strong':
        return <strong key={key}>{renderInline(token.tokens, key)}</strong>;
      case 'em':
        return <em key={key}>{renderInline(token.tokens, key)}</em>;
      case 'codespan':
        return <code key={key}>{token.text}</code>;
      case 'link': {
        const href = token.href || '';
        const hrefTerm = href.replace(/^#/, '');
        const term = hrefTerm ? deslugifyTerm(hrefTerm) : deslugifyTerm(token.text || '');
        const text = token.tokens ? renderInline(token.tokens, key) : (token.text || term);
        return (
          <span
            key={key}
            className="inline-block cursor-help bg-primary/10 px-1 rounded text-primary font-semibold hover:bg-primary/20 transition-colors"
            data-hover-term={term}
          >
            {text}
          </span>
        );
      }
      case 'br':
        return <br key={key} />;
      default:
        return token.raw ? <React.Fragment key={key}>{token.raw}</React.Fragment> : null;
    }
  });
}

function renderBlock(token: Tokens.Generic, key: string): React.ReactNode {
  switch (token.type) {
    case 'paragraph':
      return <p key={key}>{renderInline(token.tokens, key)}</p>;
    case 'heading': {
      const Tag = `h${token.depth}` as keyof JSX.IntrinsicElements;
      return <Tag key={key}>{renderInline(token.tokens, key)}</Tag>;
    }
    case 'list': {
      const listToken = token as Tokens.List;
      const ListTag = listToken.ordered ? 'ol' : 'ul';
      return (
        <ListTag key={key} className="pl-4 list-disc space-y-1">
          {listToken.items?.map((item: Tokens.ListItem, idx: number) => {
            // Handle list items that might have text directly or nested tokens
            if (item.tokens && item.tokens.length > 0) {
              return <li key={`${key}-item-${idx}`}>{renderInline(item.tokens, `${key}-item-${idx}`)}</li>;
            } else if (item.text) {
              // If the item has direct text, parse it as markdown inline
              const inlineTokens = marked.lexer(item.text, { breaks: false });
              if (inlineTokens.length > 0 && inlineTokens[0].type === 'paragraph') {
                return <li key={`${key}-item-${idx}`}>{renderInline((inlineTokens[0] as any).tokens, `${key}-item-${idx}`)}</li>;
              }
              return <li key={`${key}-item-${idx}`}>{item.text}</li>;
            }
            return <li key={`${key}-item-${idx}`} />;
          })}
        </ListTag>
      );
    }
    case 'code':
      return (
        <pre key={key} className="bg-muted text-muted-foreground rounded p-2 text-xs overflow-x-auto">
          <code>{token.text}</code>
        </pre>
      );
    case 'blockquote':
      return (
        <blockquote key={key} className="border-l-2 pl-3 italic text-muted-foreground">
          {renderInline(token.tokens, key)}
        </blockquote>
      );
    case 'text':
      return <p key={key}>{token.text}</p>;
    case 'html':
      return <div key={key} dangerouslySetInnerHTML={{ __html: token.text || '' }} />;
    default:
      return null;
  }
}

export function useRenderedMarkdown(markdown?: string): React.ReactNode {
  const nodes = useMemo(() => {
    if (!markdown) return null;
    const processed = preprocessMarkdown(markdown);
    const tokens = marked.lexer(processed);
    return tokens.map((token, index) => renderBlock(token, `block-${index}`));
  }, [markdown]);

  return nodes;
}

