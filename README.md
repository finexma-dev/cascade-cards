# Cascade Cards

<div align="center">

**CK3-style cascading wiki hovercards for React**

Turn tooltips into immersive knowledge exploration

[![npm version](https://img.shields.io/npm/v/cascade-cards.svg)](https://www.npmjs.com/package/cascade-cards)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

[Website](https://cascade.cards) • [Documentation](https://cascade.cards/docs) • [npm](https://www.npmjs.com/package/cascade-cards)

</div>

---

## What is Cascade Cards?

Cascade Cards brings **Crusader Kings 3-style hovercards** to your React applications. Instead of basic tooltips, users can hover over terms to see rich, interactive cards that link to other terms—creating an immersive, wiki-like learning experience.

Perfect for:
- 📚 **SaaS Documentation** - Help users discover features naturally
- 🎓 **Educational Platforms** - Build interconnected knowledge graphs
- 🎮 **Gaming Wikis** - CK3-style information cascades
- 💼 **Fintech Apps** - Explain complex financial terms in context

## ✨ Features

- 🎯 **Zero Configuration** - Works out of the box with sensible defaults
- 🎨 **shadcn/ui Based** - Beautiful, customizable components
- 📝 **Multiple Data Sources** - Markdown files, REST APIs, or custom sources
- ⚡ **High Performance** - Optimized rendering with minimal re-renders
- 🔗 **Infinite Cascading** - Cards can reference other cards, endlessly
- 🎭 **Fully Typed** - Complete TypeScript support
- 🎪 **Flexible Styling** - Bring your own styles or use ours

## 🚀 Quick Start

### Installation

```bash
npm install cascade-cards
# or
pnpm add cascade-cards
# or
yarn add cascade-cards
```

### Basic Usage

```tsx
import { HoverKitProvider, HoverTerm } from 'cascade-cards';
import 'cascade-cards/styles.css';

function App() {
  return (
    <HoverKitProvider>
      <p>
        Learn about <HoverTerm term="APR">annual percentage rate</HoverTerm>
        {' '}and how it affects your <HoverTerm term="LTV">loan-to-value ratio</HoverTerm>.
      </p>
    </HoverKitProvider>
  );
}
```

## 📦 Packages

This monorepo contains:

- **[cascade-cards](packages/react)** - Main React component library
- **[cascade-cards-core](packages/core)** - Headless engine for term matching and card management
- **[cascade-cards-source-markdown](packages/sources/markdown)** - Markdown file data source
- **[cascade-cards-source-rest](packages/sources/rest)** - REST API data source

## 📖 Documentation

Visit [cascade.cards/docs](https://cascade.cards/docs) for:
- Installation guide
- Quick start tutorial
- API reference
- Advanced examples
- Styling guide

## 🎨 Examples

Check out [cascade.cards](https://cascade.cards) to see Cascade Cards in action!

## 🛠️ Development

```bash
# Clone the repository
git clone https://github.com/finexma-dev/cascade-cards.git
cd cascade-cards

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Type check
pnpm typecheck
```

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## 📄 License

MIT © [FINEXMA, Inc.](https://x.com/finexma)

Inspired by the wiki mechanics of Crusader Kings 3. Not affiliated with Paradox Interactive AB.

---

<div align="center">

**Built with ❤️ by [FINEXMA, Inc.](https://x.com/finexma)**

</div>
