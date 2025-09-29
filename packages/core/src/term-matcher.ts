import type { HighlightingConfig, TermMatch } from './types.js';

export class TermMatcher {
  private terms: Set<string> = new Set();
  private config: HighlightingConfig;
  private aliases: Map<string, string[]> = new Map();

  constructor(config: HighlightingConfig) {
    this.config = config;
  }

  addTerm(term: string, aliases?: string[]): void {
    const normalizedTerm = this.config.caseSensitive ? term : term.toLowerCase();
    this.terms.add(normalizedTerm);
    
    if (aliases) {
      this.aliases.set(normalizedTerm, aliases.map(alias => 
        this.config.caseSensitive ? alias : alias.toLowerCase()
      ));
      
      // Add aliases as searchable terms too
      aliases.forEach(alias => {
        const normalizedAlias = this.config.caseSensitive ? alias : alias.toLowerCase();
        this.terms.add(normalizedAlias);
      });
    }
  }

  findMatches(element: HTMLElement): TermMatch[] {
    const matches: TermMatch[] = [];
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          
          // Skip excluded elements
          if (this.config.excludeSelectors.some(selector => parent.matches(selector))) {
            return NodeFilter.FILTER_REJECT;
          }
          
          // Skip if already highlighted or inside a manual hover term
          if (parent.closest?.('[data-hoverkit-term], [data-hover-term]')) {
            return NodeFilter.FILTER_REJECT;
          }
          
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    let node: Text | null;
    while ((node = walker.nextNode() as Text)) {
      const text = node.textContent || '';
      const nodeMatches = this.findTermsInText(text, node);
      matches.push(...nodeMatches);
    }

    return matches.sort((a, b) => a.start - b.start);
  }

  private findTermsInText(text: string, textNode: Text): TermMatch[] {
    const matches: TermMatch[] = [];
    const searchText = this.config.caseSensitive ? text : text.toLowerCase();

    for (const term of this.terms) {
      const regex = this.config.strategy === 'word-boundary' 
        ? new RegExp(`\\b${this.escapeRegExp(term)}\\b`, 'gi')
        : new RegExp(this.escapeRegExp(term), 'gi');

      let match;
      while ((match = regex.exec(searchText)) !== null) {
        matches.push({
          term: this.getCanonicalTerm(term),
          start: match.index,
          end: match.index + match[0].length,
          element: textNode.parentElement!,
          confidence: this.calculateConfidence(term, match[0])
        });
        
        // Prevent infinite loop on zero-length matches
        if (match.index === regex.lastIndex) {
          regex.lastIndex++;
        }
      }
    }

    return matches;
  }

  private getCanonicalTerm(term: string): string {
    // Find the canonical term if this is an alias
    for (const [canonical, aliases] of this.aliases.entries()) {
      if (aliases.includes(term)) {
        return canonical;
      }
    }
    return term;
  }

  private calculateConfidence(term: string, matchedText: string): number {
    // Simple confidence based on exact match vs case/whitespace differences
    const exactMatch = term === matchedText;
    const caseMatch = term.toLowerCase() === matchedText.toLowerCase();
    
    if (exactMatch) return 1.0;
    if (caseMatch) return 0.9;
    return 0.8;
  }

  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  getTerms(): string[] {
    return Array.from(this.terms);
  }

  clear(): void {
    this.terms.clear();
    this.aliases.clear();
  }
}
