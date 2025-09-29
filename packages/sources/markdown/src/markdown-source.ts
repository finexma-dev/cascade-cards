import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import { remark } from 'remark';
import remarkHtml from 'remark-html';
import fg from 'fast-glob';
import type { DataSource, DataSourceContent } from 'cascade-cards-core';

interface MarkdownSourceOptions {
  /** Glob pattern to find markdown files like 'docs/subfolder/file.md' */
  glob: string;
  /** Base directory to resolve relative paths (defaults to cwd) */
  baseDir?: string;
  /** Whether to cache parsed files in memory */
  cache?: boolean;
  /** Custom term resolver function */
  termResolver?: (term: string) => string | null;
  /** Whether to extract links from markdown content */
  extractLinks?: boolean;
}

interface ParsedMarkdownFile {
  title: string;
  content: string;
  html: string;
  frontmatter: Record<string, any>;
  filePath: string;
  slug: string;
  links: Array<{ term: string; label?: string }>;
}

export class MarkdownSource implements DataSource {
  name = 'markdown';
  private options: Required<MarkdownSourceOptions>;
  private cache: Map<string, ParsedMarkdownFile> = new Map();
  private fileMap: Map<string, string> = new Map(); // term -> filePath
  private initialized = false;

  constructor(options: MarkdownSourceOptions) {
    this.options = {
      baseDir: process.cwd(),
      cache: true,
      termResolver: (term) => this.defaultTermResolver(term),
      extractLinks: true,
      ...options
    };
  }

  async resolve(term: string): Promise<DataSourceContent | null> {
    await this.ensureInitialized();

    // Try to resolve term to a file path
    const filePath = this.options.termResolver(term);
    if (!filePath) {
      return null;
    }

    // Check if we have this file cached
    if (this.options.cache && this.cache.has(filePath)) {
      const cached = this.cache.get(filePath)!;
      return this.toDataSourceContent(cached);
    }

    try {
      // Read and parse the file
      const parsed = await this.parseMarkdownFile(filePath);
      
      if (this.options.cache) {
        this.cache.set(filePath, parsed);
      }

      return this.toDataSourceContent(parsed);
    } catch (error) {
      console.warn(`Failed to load markdown file for term "${term}":`, error);
      return null;
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    try {
      // Find all markdown files
      const files = await fg(this.options.glob, {
        cwd: this.options.baseDir,
        absolute: true
      });

      // Build the term -> file mapping
      for (const filePath of files) {
        const relativePath = path.relative(this.options.baseDir, filePath);
        const slug = this.pathToSlug(relativePath);
        this.fileMap.set(slug, filePath);

        // Also map filename without extension
        const basename = path.basename(filePath, path.extname(filePath));
        this.fileMap.set(basename.toLowerCase(), filePath);
      }

      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize markdown source:', error);
      throw error;
    }
  }

  private defaultTermResolver(term: string): string | null {
    const normalizedTerm = term.toLowerCase();
    
    // Try exact match first
    if (this.fileMap.has(normalizedTerm)) {
      return this.fileMap.get(normalizedTerm)!;
    }

    // Try with common variations
    const variations = [
      normalizedTerm.replace(/\s+/g, '-'),
      normalizedTerm.replace(/\s+/g, '_'),
      normalizedTerm.replace(/[^a-z0-9]/g, ''),
      normalizedTerm.replace(/[^a-z0-9]/g, '-')
    ];

    for (const variation of variations) {
      if (this.fileMap.has(variation)) {
        return this.fileMap.get(variation)!;
      }
    }

    return null;
  }

  private pathToSlug(relativePath: string): string {
    return relativePath
      .replace(/\.md$/, '')
      .replace(/\\/g, '/')
      .toLowerCase();
  }

  private async parseMarkdownFile(filePath: string): Promise<ParsedMarkdownFile> {
    const content = await fs.readFile(filePath, 'utf-8');
    const { data: frontmatter, content: markdownContent } = matter(content);

    // Convert markdown to HTML
    const processor = remark().use(remarkHtml, { sanitize: false });
    const result = await processor.process(markdownContent);
    const html = result.toString();

    // Extract title
    const title = frontmatter.title || 
                  this.extractTitleFromMarkdown(markdownContent) ||
                  path.basename(filePath, path.extname(filePath));

    // Extract links if enabled
    const links: Array<{ term: string; label?: string }> = [];
    if (this.options.extractLinks) {
      links.push(...this.extractLinksFromContent(markdownContent, frontmatter));
    }

    const slug = this.pathToSlug(path.relative(this.options.baseDir, filePath));

    return {
      title,
      content: markdownContent,
      html,
      frontmatter,
      filePath,
      slug,
      links
    };
  }

  private extractTitleFromMarkdown(content: string): string | null {
    // Look for first # heading
    const match = content.match(/^#\s+(.+)$/m);
    return match ? match[1].trim() : null;
  }

  private extractLinksFromContent(
    content: string, 
    frontmatter: Record<string, any>
  ): Array<{ term: string; label?: string }> {
    const links: Array<{ term: string; label?: string }> = [];

    // Extract from frontmatter
    if (frontmatter.related && Array.isArray(frontmatter.related)) {
      links.push(...frontmatter.related.map((item: any) => 
        typeof item === 'string' 
          ? { term: item }
          : { term: item.term, label: item.label }
      ));
    }

    if (frontmatter.tags && Array.isArray(frontmatter.tags)) {
      links.push(...frontmatter.tags.map((tag: string) => ({ term: tag })));
    }

    // Extract markdown links that look like internal references
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let match;
    
    while ((match = linkRegex.exec(content)) !== null) {
      const [, label, href] = match;
      
      // Only include if it looks like an internal reference
      if (!href.startsWith('http') && !href.startsWith('mailto:')) {
        const term = href.replace(/\.md$/, '').replace(/^\//, '');
        links.push({ term, label });
      }
    }

    // Extract [[wikilinks]] style references
    const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
    while ((match = wikiLinkRegex.exec(content)) !== null) {
      const reference = match[1];
      const [term, label] = reference.includes('|') 
        ? reference.split('|', 2)
        : [reference, undefined];
      
      links.push({ term: term.trim(), label: label?.trim() });
    }

    return links;
  }

  private toDataSourceContent(parsed: ParsedMarkdownFile): DataSourceContent {
    return {
      title: parsed.title,
      html: parsed.html,
      markdown: parsed.content,
      links: parsed.links,
      meta: {
        ...parsed.frontmatter,
        filePath: parsed.filePath,
        slug: parsed.slug
      }
    };
  }

  // Utility methods for external use
  async getAllTerms(): Promise<string[]> {
    await this.ensureInitialized();
    return Array.from(this.fileMap.keys());
  }

  async clearCache(): Promise<void> {
    this.cache.clear();
  }

  async reloadFiles(): Promise<void> {
    this.initialized = false;
    this.cache.clear();
    this.fileMap.clear();
    await this.ensureInitialized();
  }
}

// Factory function for easier usage
export function markdownSource(options: MarkdownSourceOptions): MarkdownSource {
  return new MarkdownSource(options);
}
