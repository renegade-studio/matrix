# Contributing to Matrix

Thank you for your interest in contributing to **matrix**! We're excited to have you as part of our community building the next generation of agent memory systems with Model Context Protocol (MCP).

## 🚀 Quick Start

### Prerequisites

Before you begin, ensure you have:

- **Node.js** ≥ 20.0.0
- **pnpm** ≥ 9.14.0 (we use pnpm, not npm)
- **Git** configured with your GitHub account

### 1. Fork & Clone

1. **Fork** the repository to your GitHub account by clicking the "Fork" button
2. **Clone** your fork:

   ```bash
   git clone https://github.com/YOUR_USERNAME/matrix.git
   cd matrix
   ```

### 2. Set Up Development Environment

```bash
# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env
# Edit .env and add your API keys (at least one required):
# OPENAI_API_KEY=your_openai_key
# ANTHROPIC_API_KEY=your_anthropic_key

# Build the project
pnpm run build

# Verify setup by running tests
pnpm test
```

### 3. Create Feature Branch

```bash
git checkout -b feature/your-descriptive-branch-name
# Examples:
# - feature/add-memory-persistence
# - fix/mcp-connection-timeout
# - docs/update-api-examples
```

## 🛠 Development Workflow

### Code Quality Standards

Before committing, ensure your code meets our standards:

```bash
# Type checking
pnpm run typecheck

# Linting (with auto-fix)
pnpm run lint:fix

# Code formatting
pnpm run format

# Run tests
pnpm test

# Full build verification
pnpm run build
```

### Project Structure

Understanding the codebase structure:

```
src/
├── app/           # CLI application entry point
├── core/
│   ├── brain/     # Core agent logic
│   │   ├── llm/       # LLM providers (OpenAI, Anthropic)
│   │   ├── memAgent/  # Agent management
│   │   └── systemPrompt/
│   ├── mcp/       # Model Context Protocol integration
│   ├── session/   # Session management
│   └── logger/    # Logging infrastructure
└── utils/         # Shared utilities
```

### Development Guidelines

#### TypeScript Best Practices

- Use strict TypeScript configuration
- Implement proper error handling with custom error types
- Use interfaces and types for clear API contracts

#### Code Style

- Follow existing naming conventions
- Write self-documenting code with clear variable names
- Add JSDoc comments for public APIs
- Maintain consistent indentation and formatting

#### Testing

- Write tests for new functionality in `__test__/` directories
- Maintain or improve test coverage
- Use descriptive test names that explain the behavior
- Mock external dependencies appropriately

#### MCP Integration

- Follow MCP protocol specifications
- Implement proper connection lifecycle management
- Add timeout and error handling for server connections
- Use type-safe server configuration validation

## 📋 Contribution Types

### 🐛 Bug Fixes

- Check existing issues before creating new ones
- Include reproduction steps and environment details
- Write regression tests to prevent future occurrences

### ✨ New Features

- **Open an issue first** for discussion on larger features
- Ensure the feature aligns with matrix's core mission
- Include comprehensive tests and documentation
- Update configuration schemas if needed

### 📚 Documentation

- Keep README.md and docs/ up to date
- Include code examples that work out-of-the-box
- Update configuration references for new options

### 🔧 Refactoring

- Maintain backward compatibility unless discussed
- Include performance benchmarks for optimization claims
- Update related tests and documentation

## 🔄 Submission Process

### 5. Commit Your Changes

Follow conventional commit format:

```bash
git add .
git commit -m "feat: add persistent memory layer for agent sessions"
# Other examples:
# git commit -m "fix: resolve MCP connection timeout issues"
# git commit -m "docs: update configuration examples"
# git commit -m "test: add integration tests for memory persistence"
```

### 6. Push and Create Pull Request

```bash
git push origin feature/your-branch-name
```

Open a Pull Request against the `main` branch with:

- **Clear title** describing the change
- **Detailed description** explaining:
  - What problem this solves
  - How you solved it
  - Any breaking changes
  - Testing performed
- **Link related issues** using `Fixes #123` or `Closes #123`

### Pull Request Checklist

- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Tests added/updated and passing
- [ ] Documentation updated if needed
- [ ] No breaking changes (or clearly documented)
- [ ] Commits follow conventional format
- [ ] Branch is up to date with main

## 🧪 Testing

### Running Tests

```bash
# Run all tests
pnpm test

```

### Test Categories

- **Unit tests**: Test individual functions and classes

## 🐛 Reporting Issues

When reporting bugs, include:

1. **Environment details**: Node.js version, OS, pnpm version
2. **Reproduction steps**: Minimal code example that demonstrates the issue
3. **Expected behavior**: What should happen
4. **Actual behavior**: What actually happens
5. **Configuration**: Relevant parts of your `matrix.yml` and `.env` (redact API keys)
6. **Logs**: Any error messages or relevant log output

## 💡 Feature Requests

Before suggesting new features:

1. **Check existing issues** to avoid duplicates
2. **Explain the use case** - what problem does this solve?
3. **Propose implementation** if you have ideas
4. **Consider alternatives** that might already exist

## 🏷 Release Process

We follow semantic versioning:

- **Patch** (0.1.x): Bug fixes, small improvements
- **Minor** (0.x.0): New features, non-breaking changes
- **Major** (x.0.0): Breaking changes

## 🤝 Community

- **Discord**: Join our [Discord community](https://discord.com/invite/UMRrpNjh5W)
- **GitHub Discussions**: For broader conversations and Q&A
- **Issues**: For bug reports and feature requests

## 📜 License

By contributing to matrix, you agree that your contributions will be licensed under the [Elastic License 2.0](LICENSE).

---

**Questions?** Don't hesitate to ask in our Discord or open a discussion on GitHub. We're here to help make your contribution experience smooth and rewarding!

Happy coding! 🎉
