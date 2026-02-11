# Contributing to ASUS Mesh WiFi Analyzer

## Development Setup

```bash
# Clone the repository
git clone https://github.com/openclaw/asus-mesh-wifi-analyzer.git
cd asus-mesh-wifi-analyzer

# Install dependencies
npm install

# Copy environment file
cp .env.example .env
# Edit .env with your router credentials

# Run in development mode
npm run dev

# Build
npm run build

# Run tests
npm test
```

## Code Style

- TypeScript strict mode enabled
- ESLint + Prettier for formatting
- Zod for runtime type validation
- No `any` types allowed
- Explicit return types on functions

## Project Structure

```
src/
├── config/     # Configuration loading
├── core/       # Business logic (no I/O)
├── infra/      # External services (SSH, HTTP)
├── skill/      # OpenClaw interface
├── types/      # Zod schemas and types
└── utils/      # Pure helper functions
```

## Adding New Features

1. Create types in `src/types/`
2. Implement core logic in `src/core/`
3. Add infrastructure if needed in `src/infra/`
4. Export from index files
5. Add tests in `tests/`
6. Update README.md

## Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run once (no watch)
npm run test:run
```

## Pull Request Process

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run `npm run lint` and `npm test`
5. Submit PR with clear description

## License

MIT - see LICENSE file
