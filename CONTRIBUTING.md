# Contributing to PacificOceanAI

First off, thank you for considering contributing to PacificOceanAI! It's people like you that make PacificOceanAI such a great tool.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Setup](#development-setup)
- [Coding Guidelines](#coding-guidelines)
- [Commit Messages](#commit-messages)
- [Pull Request Process](#pull-request-process)

## Code of Conduct

This project and everyone participating in it is governed by our Code of Conduct. By participating, you are expected to uphold this code. Please report unacceptable behavior to the project maintainers.

### Our Standards

- **Be respectful**: Treat everyone with respect and kindness
- **Be collaborative**: Work together and help each other
- **Be inclusive**: Welcome newcomers and diverse perspectives
- **Be constructive**: Provide helpful feedback and suggestions

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Chrome or Edge browser
- Basic knowledge of TypeScript and React
- Familiarity with browser extensions

### Development Setup

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/yourusername/pacific-ocean-ai.git
   cd pacific-ocean-ai
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start development mode**
   ```bash
   npm run dev
   ```

4. **Load the extension in your browser**
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist` folder

5. **Make your changes**
   - The extension will auto-reload on file changes
   - Check the browser console for errors

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the existing issues to avoid duplicates. When you create a bug report, include as many details as possible:

- **Use a clear and descriptive title**
- **Describe the exact steps to reproduce the problem**
- **Provide specific examples** (code snippets, screenshots)
- **Describe the behavior you observed** and what you expected
- **Include your environment details** (OS, browser version, extension version)

**Bug Report Template:**

```markdown
**Describe the bug**
A clear description of what the bug is.

**To Reproduce**
Steps to reproduce:
1. Go to '...'
2. Click on '...'
3. See error

**Expected behavior**
What you expected to happen.

**Screenshots**
If applicable, add screenshots.

**Environment:**
- OS: [e.g., Windows 11]
- Browser: [e.g., Chrome 120]
- Extension Version: [e.g., 2.0.3]

**Additional context**
Any other relevant information.
```

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion:

- **Use a clear and descriptive title**
- **Provide a detailed description** of the suggested enhancement
- **Explain why this enhancement would be useful**
- **List any alternatives you've considered**

### Your First Code Contribution

Unsure where to begin? Look for issues labeled:

- `good first issue` - Good for newcomers
- `help wanted` - Extra attention needed
- `documentation` - Documentation improvements

### Pull Requests

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Follow the coding guidelines
   - Add tests if applicable
   - Update documentation

3. **Test your changes**
   ```bash
   npm run build
   # Load the extension and test manually
   ```

4. **Commit your changes**
   ```bash
   git commit -m "feat: add amazing feature"
   ```

5. **Push to your fork**
   ```bash
   git push origin feature/your-feature-name
   ```

6. **Open a Pull Request**
   - Fill in the PR template
   - Link any related issues
   - Request review from maintainers

## Coding Guidelines

### TypeScript Style

- Use TypeScript for all new code
- Enable strict mode
- Avoid `any` types when possible
- Use interfaces for object shapes
- Document complex types

```typescript
// Good
interface UserConfig {
  apiKey: string;
  modelId: string;
  temperature?: number;
}

// Avoid
const config: any = { ... };
```

### React Components

- Use functional components with hooks
- Keep components small and focused
- Use meaningful component names
- Extract reusable logic into custom hooks

```typescript
// Good
export const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  // ...
};
```

### File Organization

- One component per file
- Group related files in folders
- Use index.ts for public exports
- Keep file names consistent with exports

```
src/
├── services/
│   ├── llm/
│   │   ├── LLMService.ts
│   │   ├── adapters/
│   │   │   ├── OpenAIProvider.ts
│   │   │   └── index.ts
│   │   └── index.ts
```

### Naming Conventions

- **Files**: PascalCase for components, camelCase for utilities
- **Components**: PascalCase (e.g., `ChatMessage`)
- **Functions**: camelCase (e.g., `formatMessage`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `MAX_RETRIES`)
- **Interfaces**: PascalCase with `I` prefix for services (e.g., `ILLMService`)

### Code Quality

- Write self-documenting code
- Add comments for complex logic
- Keep functions small and focused
- Avoid deep nesting
- Handle errors gracefully

```typescript
// Good: Clear and focused
async function fetchUserData(userId: string): Promise<User> {
  try {
    const response = await api.get(`/users/${userId}`);
    return response.data;
  } catch (error) {
    logger.error('Failed to fetch user data', { userId, error });
    throw new Error('User data unavailable');
  }
}
```

### Testing

- Write tests for new features
- Test edge cases and error conditions
- Keep tests simple and readable
- Mock external dependencies

## Commit Messages

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

### Examples

```bash
feat(llm): add support for Gemini 2.0 Flash

Implement GeminiProvider with streaming support and function calling.

Closes #123

---

fix(editor): resolve text selection issue in Safari

The text selection was not working correctly in Safari due to
browser-specific behavior. Added Safari-specific handling.

Fixes #456

---

docs: update installation instructions

Add troubleshooting section for common installation issues.
```

## Pull Request Process

1. **Ensure your PR**:
   - Follows the coding guidelines
   - Includes tests if applicable
   - Updates documentation
   - Has a clear description

2. **PR Template**:
   ```markdown
   ## Description
   Brief description of changes
   
   ## Type of Change
   - [ ] Bug fix
   - [ ] New feature
   - [ ] Breaking change
   - [ ] Documentation update
   
   ## Testing
   How has this been tested?
   
   ## Checklist
   - [ ] Code follows style guidelines
   - [ ] Self-review completed
   - [ ] Comments added for complex code
   - [ ] Documentation updated
   - [ ] No new warnings generated
   ```

3. **Review Process**:
   - Maintainers will review your PR
   - Address any feedback or requested changes
   - Once approved, your PR will be merged

4. **After Merge**:
   - Your contribution will be included in the next release
   - You'll be added to the contributors list

## Development Tips

### Debugging

- Use Chrome DevTools for debugging
- Check the extension's background page console
- Use `console.log` statements (remove before committing)
- Test in both Chrome and Edge

### Performance

- Avoid unnecessary re-renders
- Use React.memo for expensive components
- Debounce user input handlers
- Lazy load heavy components

### Accessibility

- Use semantic HTML
- Add ARIA labels where needed
- Ensure keyboard navigation works
- Test with screen readers

## Questions?

Feel free to:
- Open an issue for questions
- Join our discussions
- Reach out to maintainers

## Recognition

Contributors will be recognized in:
- README.md contributors section
- Release notes
- Project documentation

Thank you for contributing to PacificOceanAI! 🎉
