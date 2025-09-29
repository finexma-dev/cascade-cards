# Cascade Cards REST Source

Fetch hovercard content from your REST API.

```ts
import { restSource } from 'cascade-cards-source-rest';

const source = restSource({
  baseUrl: 'https://api.example.com',
  termPath: (term) => `/hovercards/${term}`,
  headers: {
    Authorization: `Bearer ${process.env.API_TOKEN}`,
  },
  transform(data) {
    if (!data) return null;
    return {
      title: data.title,
      markdown: data.markdown,
      links: data.links,
      meta: data.meta,
    };
  },
});
```

Pass the source to `HoverKitProvider` alongside other sources.
