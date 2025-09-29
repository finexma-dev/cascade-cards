# Contributing to Cascade Cards

Thank you for your interest in contributing to Cascade Cards! We welcome contributions from the community.

## Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/finexma-dev/cascade-cards.git
   cd cascade-cards
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Build all packages**
   ```bash
   pnpm build
   ```

## Project Structure

```
cascade-cards/
├── packages/
│   ├── core/              # Headless hover engine
│   ├── react/             # React components
│   └── sources/
│       ├── markdown/      # Markdown data source adapter
│       └── rest/          # REST API data source adapter
└── examples/              # Usage examples (coming soon)
```

## How to Contribute

### Bug Reports
- Use GitHub Issues to report bugs
- Include steps to reproduce, expected behavior, and actual behavior
- Include your environment details (Node.js version, browser, etc.)

### Feature Requests
- Use GitHub Issues with the "enhancement" label
- Describe the use case and expected behavior
- Consider starting with a discussion for major features

### Pull Requests
1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes
4. Add tests if applicable
5. Run the test suite: `pnpm test`
6. Run type checking: `pnpm typecheck`
7. Commit with a clear message
8. Push and create a pull request

### Code Style
- TypeScript for all code
- ESLint and Prettier for formatting
- Follow existing patterns in the codebase
- Include JSDoc comments for public APIs

## Building New Data Source Adapters

Cascade Cards is designed to be extensible through data source adapters. To create a new adapter:

1. Implement the `DataSource` interface from `cascade-cards-core`
2. Add the adapter to `packages/sources/your-adapter`
3. Include tests and documentation
4. Export a factory function for easy usage

See the existing [markdown](packages/sources/markdown) and [rest](packages/sources/rest) adapters for reference.

## Testing

- Unit tests with Vitest
- Component tests with React Testing Library

Run tests:
```bash
pnpm test          # Run all tests
pnpm test:watch    # Watch mode
pnpm test:coverage # With coverage
```

## Type Checking

```bash
pnpm typecheck     # Type check all packages
```

## Building

```bash
pnpm build         # Build all packages
pnpm clean         # Clean all build outputs
```

## Documentation
- Update README files for any new features
- Include JSDoc comments for public APIs
- Keep the main README.md up to date with new features

## Publishing

Packages are published to npm by maintainers. To publish:

```bash
# Make sure you're logged in to npm
npm login

# From each package directory
cd packages/core
pnpm run prepublishOnly
npm publish

cd ../react
pnpm run prepublishOnly
npm publish

# etc...
```

## Questions?
- Open a GitHub Discussion for questions
- Check existing issues and discussions first
- Be respectful and constructive in all interactions

## Code of Conduct
- Be respectful and inclusive
- No harassment or discrimination
- Constructive criticism only
- Help make Cascade Cards welcoming for everyone

Thank you for contributing to Cascade Cards! 🚀
