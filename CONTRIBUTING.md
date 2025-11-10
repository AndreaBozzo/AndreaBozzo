# 🤝 Contributing Guidelines

Thank you for your interest in contributing to my projects! This document describes how to collaborate effectively.

## 🚀 How to Contribute

### 1. Before You Start
- Check open Issues in the specific repository
- Read the project documentation (README, docs)
- Familiarize yourself with the [Code of Conduct](#code-of-conduct)
- If you have a new idea, open a Discussion or Issue first to discuss it

### 2. Local Setup

Setup varies by project. Check the specific README, but generally:

```bash
# Fork and clone the repository
git clone https://github.com/YOUR-USERNAME/REPO-NAME.git
cd REPO-NAME

# Install dependencies (varies by project)
# Python:
pip install -r requirements.txt
# or
poetry install

# Rust:
cargo build

# Go:
go mod download

# Node.js:
npm install

# Run tests
# Python: pytest
# Rust: cargo test
# Go: go test ./...
# Node.js: npm test
```

### 3. Development Workflow

1. **Create a branch** for your feature:
   ```bash
   git checkout -b feature/feature-name
   # or
   git checkout -b fix/bug-name
   ```

2. **Develop** following project conventions
   - Keep changes focused and atomic
   - Write clean, maintainable code
   - Comment complex sections

3. **Test** your changes:
   - Run existing tests
   - Add new tests for your changes
   - Verify no regressions

4. **Commit** with clear messages:
   ```bash
   git commit -m "feat: add support for X"
   ```

5. **Push** and create a **Pull Request**:
   ```bash
   git push origin feature/feature-name
   ```

## 📋 Guidelines

### Code

**Languages and Best Practices:**
- **Rust**: Use `rustfmt` and `clippy`, follow Rust idioms
- **Go**: Use `gofmt`, follow Effective Go
- **Python**: Follow PEP 8, use type hints and docstrings
- **JavaScript/TypeScript**: ESLint + Prettier
- **SQL**: Consistent formatting, optimized queries

**General:**
- Readable code > "clever" code
- Inline documentation when necessary
- Robust error handling
- Performance matters, but readability first

### Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/) format:

- `feat:` new features
- `fix:` bug fixes
- `docs:` documentation updates
- `test:` adding/modifying tests
- `refactor:` code refactoring
- `perf:` performance improvements
- `chore:` general maintenance

**Examples:**
```
feat: add streaming CDC support for PostgreSQL
fix: resolve memory leak in connection pool
docs: update README with installation instructions
test: add integration tests for API endpoints
```

### Pull Requests

**Checklist before opening a PR:**
- ✅ Descriptive title that summarizes changes
- ✅ Detailed description of "what" and "why"
- ✅ Tests updated and passing
- ✅ Documentation updated if needed
- ✅ No conflicts with main branch
- ✅ CI/CD passing

**PR Template:**
```markdown
## Description
Brief description of changes

## Motivation
Why is this change necessary?

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation

## Testing
How were the changes tested?

## Checklist
- [ ] Code follows project conventions
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] CI/CD passing
```

## 🎯 Contribution Areas

### Always Welcome
- 🐛 **Bug fixes** and corrections
- 📚 **Documentation** (typos, clarifications, examples)
- 🧪 **Test coverage** improvements
- 🔧 **Performance** optimizations
- ♿ **Accessibility** improvements

### Features and Enhancements
- 💡 **New features** (discuss first via Issue/Discussion)
- 🔌 **Integrations** with other tools/services
- 📊 **Visualizations** and dashboards
- 🌐 **Internationalization** (i18n)

### Special Contributions
- 📝 **Blog posts** and tutorials
- 🎥 **Videos** or demos
- 🗣️ **Conference** presentations
- 🌟 **Feedback** and design suggestions

## 🆘 Getting Help

- 💬 **GitHub Discussions**: For general questions and discussions
- 🐛 **GitHub Issues**: For bug reports and feature requests
- 📧 **Email**: [andreabozzo92@gmail.com](mailto:andreabozzo92@gmail.com)
- 💼 **LinkedIn**: [Andrea Bozzo](https://www.linkedin.com/in/andrea-bozzo-/)
- 📝 **Blog**: [andreabozzo.github.io/AndreaBozzo/blog](https://andreabozzo.github.io/AndreaBozzo/blog/)

## 📄 Licenses

My projects are generally released under permissive licenses (MIT, Apache 2.0, etc.).
By contributing, you agree that your code will be released under the same license as the project.

## Code of Conduct

### Expected Behaviors ✅
- **Mutual respect** and inclusivity
- **Constructive feedback** and professionalism
- **Focus on solutions** and collaboration
- **Patience** with first-time contributors
- **Recognition** of others' work

### Not Tolerated ❌
- Offensive or discriminatory language
- Personal attacks or harassment
- Spam or excessive self-promotion
- Intimidating behavior
- Privacy violations

### Enforcement
Violations of the Code of Conduct may result in:
1. Private warning
2. Temporary removal from project
3. Permanent ban in severe cases

Report inappropriate behavior to: [andreabozzo92@gmail.com](mailto:andreabozzo92@gmail.com)

---

## 🌟 Recognition

Every contribution, no matter how small, is appreciated! Contributors will be:
- Mentioned in CONTRIBUTORS.md (if present)
- Recognized in release notes
- Tagged in social posts when appropriate

---

**Thank you for contributing to the open source ecosystem! 🚀**

*"The best way to predict the future is to build it." - Alan Kay*
