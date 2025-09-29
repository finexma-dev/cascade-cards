import { request } from 'undici';
import type { DataSource, DataSourceContent } from 'cascade-cards-core';

export interface RestSourceOptions {
  /** Base URL for the REST API, e.g. https://api.example.com */
  baseUrl: string;
  /** Optional path to fetch a term, defaults to `/hovercards/:term` */
  termPath?: string | ((term: string) => string);
  /** Optional headers to include with each request */
  headers?: Record<string, string>;
  /** Optional function to post-process the fetch response */
  transform?: (data: unknown) => DataSourceContent | null;
}

export class RestSource implements DataSource {
  name = 'rest';
  private options: RestSourceOptions;

  constructor(options: RestSourceOptions) {
    if (!options?.baseUrl) {
      throw new Error('RestSource requires a baseUrl option');
    }
    this.options = options;
  }

  async resolve(term: string): Promise<DataSourceContent | null> {
    const url = this.buildUrl(term);

    try {
      const { body } = await request(url, {
        headers: this.options.headers,
      });
      const data = await body.json();

      if (this.options.transform) {
        return this.options.transform(data);
      }

      if (this.isDataSourceContent(data)) {
        return data;
      }

      return null;
    } catch (error) {
      console.warn(`[RestSource] Failed to resolve term "${term}":`, error);
      return null;
    }
  }

  private buildUrl(term: string): string {
    const { baseUrl, termPath } = this.options;
    const encoded = encodeURIComponent(term);

    if (typeof termPath === 'function') {
      return new URL(termPath(term), baseUrl).toString();
    }

    const path = termPath ?? `/hovercards/${encoded}`;
    return new URL(path.replace(':term', encoded), baseUrl).toString();
  }

  private isDataSourceContent(value: unknown): value is DataSourceContent {
    if (!value || typeof value !== 'object') return false;
    const record = value as Record<string, unknown>;
    return typeof record.title === 'string' &&
      (typeof record.markdown === 'string' || typeof record.html === 'string');
  }
}

export function restSource(options: RestSourceOptions): RestSource {
  return new RestSource(options);
}

