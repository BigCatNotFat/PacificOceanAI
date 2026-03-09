# PacificOceanAI Development Guide

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Project Structure](#project-structure)
- [Core Concepts](#core-concepts)
- [Development Workflow](#development-workflow)
- [Adding New Features](#adding-new-features)
- [Testing](#testing)
- [Debugging](#debugging)

## Architecture Overview

PacificOceanAI follows a clean, modular architecture with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────┐
│                    Workbench (UI)                       │
│  React Components, Hooks, Styles                        │
└─────────────────────┬───────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────┐
│                   Services Layer                        │
│  AgentService, LLMService, EditorService, etc.          │
└─────────────────────┬───────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────┐
│                  Platform Layer                         │
│  Interfaces, Abstractions, DI Container                 │
└─────────────────────┬───────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────┐
│                   Base Layer                            │
│  Utilities, Common Types, Event System                  │
└─────────────────────────────────────────────────────────┘
```

### Key Design Patterns

1. **Dependency Injection**: Services are injected via constructor
2. **Service Locator**: Platform layer provides service interfaces
3. **Provider Pattern**: Multiple AI providers with unified interface
4. **Bridge Pattern**: Safe communication with Overleaf editor
5. **Observer Pattern**: Event-driven UI updates

## Project Structure

```
src/
├── base/                    # Foundation layer
│   ├── browser/            # Browser-specific utilities
│   │   ├── dom.ts          # DOM manipulation helpers
│   │   └── storage.ts      # Storage abstractions
│   └── common/             # Common utilities
│       ├── event.ts        # Event emitter
│       ├── disposable.ts   # Resource management
│       └── rpcChannel.ts   # RPC communication
│
├── platform/               # Platform abstractions
│   ├── agent/             # Agent system interfaces
│   ├── configuration/     # Configuration management
│   ├── editor/            # Editor abstractions
│   ├── instantiation/     # DI container
│   ├── llm/               # LLM interfaces
│   └── storage/           # Storage interfaces
│
├── services/              # Service implementations
│   ├── agent/            # AI agent system
│   │   ├── tools/        # Tool implementations
│   │   └── multiAgent/   # Multi-agent orchestration
│   ├── editor/           # Overleaf integration
│   │   ├── bridge/       # Bridge to Overleaf
│   │   └── modules/      # Editor modules
│   ├── llm/              # LLM providers
│   │   └── adapters/     # Provider adapters
│   └── literature/       # Literature search
│
├── workbench/            # UI layer
│   ├── parts/           # UI components
│   ├── hooks/           # React hooks
│   ├── context/         # React context
│   └── styles/          # CSS styles
│
├── extension/           # Extension entry points
│   ├── background/     # Service worker
│   ├── content/        # Content script
│   ├── options/        # Settings page
│   └── popup/          # Popup UI
│
└── utils/              # Shared utilities
    ├── logger.ts       # Logging utility
    └── silenceConsole.ts
```

## Core Concepts

### 1. Dependency Injection

Services are registered and resolved through the DI container:

```typescript
// Define service interface
export interface IMyService {
  doSomething(): void;
}

export const IMyServiceId = 'myService';

// Implement service
@injectable(IDependencyServiceId)
export class MyService implements IMyService {
  constructor(
    private readonly dependency: IDependencyService
  ) {}
  
  doSomething(): void {
    this.dependency.help();
  }
}

// Register service
serviceCollection.set(IMyServiceId, new MyService(...));

// Use service
const myService = instantiationService.get<IMyService>(IMyServiceId);
```

### 2. LLM Provider System

All AI providers implement a common interface:

```typescript
export abstract class BaseLLMProvider {
  abstract chat(
    messages: LLMMessage[],
    config: LLMConfig
  ): Promise<LLMFinalMessage>;
  
  abstract managerChat(
    messages: LLMMessage[],
    config: LLMConfig
  ): Promise<LLMFinalMessage>;
}
```

### 3. Tool System

Tools extend the AI's capabilities:

```typescript
export abstract class BaseTool implements ITool {
  abstract name: string;
  abstract description: string;
  abstract parameters: ToolParameters;
  
  abstract execute(args: any): Promise<ToolResult>;
}
```

### 4. Event System

Services communicate via events:

```typescript
// Define event
interface MyEvent {
  data: string;
}

// Emit event
private readonly _onMyEvent = new Emitter<MyEvent>();
public readonly onMyEvent = this._onMyEvent.event;

// Fire event
this._onMyEvent.fire({ data: 'hello' });

// Listen to event
service.onMyEvent(event => {
  console.log(event.data);
});
```

## Development Workflow

### 1. Setup Development Environment

```bash
# Clone repository
git clone https://github.com/BigCatNotFat/PacificOceanAI.git
cd pacific-ocean-ai

# Install dependencies
npm install

# Start development server
npm run dev
```

### 2. Load Extension in Browser

1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `dist` folder
5. Extension will auto-reload on changes

### 3. Development Tools

- **Chrome DevTools**: F12 to open
- **Extension Console**: Right-click extension icon → Inspect popup
- **Background Console**: chrome://extensions → Service worker → Inspect
- **Content Script Console**: F12 on Overleaf page

## Adding New Features

### Adding a New AI Provider

1. **Create provider class**:

```typescript
// src/services/llm/adapters/MyProvider.ts
export class MyProvider extends BaseLLMProvider {
  async chat(messages: LLMMessage[], config: LLMConfig) {
    // Implementation
  }
  
  async managerChat(messages: LLMMessage[], config: LLMConfig) {
    // Implementation
  }
}
```

2. **Register in LLMService**:

```typescript
// src/services/llm/LLMService.ts
case 'my-provider':
  provider = new MyProvider(
    this.modelRegistry,
    this.uiStreamService,
    apiConfig
  );
  break;
```

### Adding a New Tool

1. **Create tool class**:

```typescript
// src/services/agent/tools/implementations/MyTool.ts
export class MyTool extends BaseTool {
  name = 'my_tool';
  description = 'Does something useful';
  parameters = {
    type: 'object',
    properties: {
      input: { type: 'string', description: 'Input text' }
    },
    required: ['input']
  };
  
  async execute(args: { input: string }): Promise<ToolResult> {
    // Implementation
    return {
      success: true,
      result: 'Done!'
    };
  }
}
```

2. **Register in ToolRegistry**:

```typescript
// src/services/agent/tools/ToolRegistry.ts
this.registerTool(new MyTool(dependencies));
```

### Adding a New UI Component

1. **Create component**:

```typescript
// src/workbench/parts/MyComponent.tsx
export const MyComponent: React.FC<MyComponentProps> = ({ prop }) => {
  const [state, setState] = useState('');
  
  return (
    <div className="my-component">
      {/* Component content */}
    </div>
  );
};
```

2. **Add styles**:

```css
/* src/workbench/styles/my-component.css */
.my-component {
  /* Styles */
}
```

3. **Use component**:

```typescript
import { MyComponent } from './MyComponent';

<MyComponent prop="value" />
```

## Testing

### Manual Testing

1. **Build extension**: `npm run build`
2. **Load in browser**: Follow installation steps
3. **Test features**: Use extension on Overleaf
4. **Check console**: Look for errors

### Testing Checklist

- [ ] Extension loads without errors
- [ ] Settings page works
- [ ] AI chat responds correctly
- [ ] Text actions work
- [ ] Literature search works
- [ ] No console errors
- [ ] Works in Chrome and Edge
- [ ] Works on different Overleaf projects

## Debugging

### Common Issues

**Extension not loading**:
- Check manifest.json syntax
- Check for TypeScript errors
- Rebuild: `npm run build`

**AI not responding**:
- Check API key configuration
- Check network tab for failed requests
- Check console for errors

**UI not updating**:
- Check React DevTools
- Check event listeners
- Check state management

### Debug Tips

1. **Use console.log strategically**:
```typescript
console.log('[MyService] Doing something', { data });
```

2. **Use Chrome DevTools breakpoints**:
- Set breakpoints in Sources tab
- Step through code execution

3. **Check extension logs**:
- Background: chrome://extensions → Service worker
- Content: F12 on Overleaf page
- Popup: Right-click icon → Inspect

4. **Monitor network requests**:
- Open Network tab
- Filter by API domain
- Check request/response

### Performance Profiling

1. Open Chrome DevTools
2. Go to Performance tab
3. Record interaction
4. Analyze flame graph

## Best Practices

### Code Style

- Use TypeScript strict mode
- Avoid `any` types
- Use meaningful variable names
- Keep functions small and focused
- Add comments for complex logic

### Error Handling

```typescript
try {
  await riskyOperation();
} catch (error) {
  logger.error('Operation failed', { error });
  // Handle error gracefully
  throw new Error('User-friendly message');
}
```

### Resource Management

```typescript
class MyService {
  private disposables: IDisposable[] = [];
  
  constructor() {
    this.disposables.push(
      service.onEvent(this.handleEvent)
    );
  }
  
  dispose(): void {
    this.disposables.forEach(d => d.dispose());
  }
}
```

### Performance

- Debounce user input
- Use React.memo for expensive components
- Lazy load heavy dependencies
- Avoid unnecessary re-renders

## Resources

- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [React Documentation](https://react.dev/)
- [Chrome Extension Docs](https://developer.chrome.com/docs/extensions/)
- [Vite Documentation](https://vitejs.dev/)

## Getting Help

- Open an issue on GitHub
- Check existing issues and discussions
- Read the documentation
- Ask in discussions

---

Happy coding! 🚀
