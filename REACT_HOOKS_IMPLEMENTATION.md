# React Service Hooks 实现完成报告

## 概述

已完成 React Service Hooks 系统，实现了 React 组件层与 DI 服务层的无缝集成。

## 问题背景

在微内核架构中，业务逻辑封装在 Service 层，UI 层（React 组件）需要：
1. 获取 Service 实例
2. 调用 Service 方法
3. 订阅 Service 事件并自动更新 UI

但是：
- ❌ 不能在组件中直接 `new Service()`（违反 DI 原则）
- ❌ 不能手动管理事件订阅（容易内存泄漏）
- ❌ 不能让 Service 依赖 React（架构分层原则）

## 解决方案

通过 React Context 和自定义 Hooks，优雅地连接两个世界。

## 实现的文件

### 1. DI Context（`workbench/context/DIContext.tsx`）

**核心组件**：
- `DIContext` - React Context，存储 DI 容器
- `DIProvider` - Context Provider 组件
- `useDIContainer` - 获取 DI 容器的 Hook

```typescript
// 在应用根部提供 DI 容器
<DIProvider container={diContainer}>
  <App />
</DIProvider>
```

### 2. useService Hook（`workbench/hooks/useService.ts`）

**功能**：
- 在 React 组件中获取 Service 实例
- 使用 `useMemo` 缓存实例，避免重复创建
- 类型安全，完整的 TypeScript 支持

```typescript
function MyComponent() {
  const editorService = useService<IEditorService>(IEditorServiceId);
  
  const handleClick = async () => {
    const fileName = await editorService.getCurrentFileName();
  };
}
```

### 3. useServiceEvent Hook（`workbench/hooks/useServiceEvent.ts`）

**功能**：
- 自动订阅 Service 事件
- 事件触发时自动更新 React State
- 组件卸载时自动取消订阅（防止内存泄漏）

**三个变体**：

#### a) `useServiceEvent` - 基础版本
订阅事件并返回最新值：

```typescript
const currentFile = useServiceEvent(
  editorService.onDidChangeActiveFile,
  null // 初始值
);
```

#### b) `useServiceEventWithCallback` - 回调版本
订阅事件并执行回调，不更新 State：

```typescript
useServiceEventWithCallback(
  logService.onDidLogError,
  (error) => toast.error(error.message)
);
```

#### c) `useServiceEventArray` - 数组累积版本
将事件值累积到数组中，适合日志、历史记录：

```typescript
const logs = useServiceEventArray(
  logService.onDidLog,
  100 // 最大长度
);
```

### 4. 使用示例（`workbench/hooks/example.tsx`）

包含 7 个完整示例：
1. 基础使用 - 调用服务方法
2. 自动订阅事件 - 实时更新
3. 读取文件内容
4. 文件树显示
5. 组合多个服务
6. 应用根组件 - 提供 DI 容器
7. 自定义 Hook 封装

## 核心架构

```
┌─────────────────────────────────────────────────────────┐
│                    React Component                       │
│                                                          │
│  const editorService = useService(IEditorServiceId);    │
│  const file = useServiceEvent(                          │
│    editorService.onDidChangeActiveFile, null            │
│  );                                                      │
│                                                          │
│  └─────────────┬──────────────────────────────────────  │
└────────────────┼──────────────────────────────────────────┘
                 │
                 │ useDIContainer()
                 │
┌────────────────▼──────────────────────────────────────────┐
│              DIContext (React Context)                    │
│                                                           │
│  <DIProvider container={diContainer}>                    │
│    <App />                                               │
│  </DIProvider>                                           │
│                                                           │
│  └─────────────┬────────────────────────────────────────  │
└────────────────┼──────────────────────────────────────────┘
                 │
                 │ container.getService(id)
                 │
┌────────────────▼──────────────────────────────────────────┐
│          InstantiationService (DI 容器)                  │
│                                                           │
│  - 管理所有服务实例                                      │
│  - 自动解析依赖                                          │
│  - 单例模式                                              │
│                                                           │
│  └─────────────┬────────────────────────────────────────  │
└────────────────┼──────────────────────────────────────────┘
                 │
                 │ 返回服务实例
                 │
┌────────────────▼──────────────────────────────────────────┐
│           Service Instance (服务实例)                    │
│                                                           │
│  EditorService / ConfigService / AgentService ...        │
│  - 业务逻辑                                              │
│  - 事件发射 (onDidXxx)                                   │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

## 使用流程

### 1. 应用入口 - 创建并提供 DI 容器

```typescript
// extension/content/main.tsx
import { InstantiationService, ServiceDescriptor } from './platform/instantiation';
import { DIProvider } from './workbench/context/DIContext';
import { IEditorServiceId } from './platform/editor/editor';
import { OverleafEditorService } from './services/editor/OverleafEditorService';

// 创建 DI 容器
const container = new InstantiationService();

// 注册服务
container.registerDescriptor(
  new ServiceDescriptor(IEditorServiceId, OverleafEditorService)
);

// 提供给 React 应用
createRoot(document.getElementById('root')).render(
  <DIProvider container={container}>
    <App />
  </DIProvider>
);
```

### 2. 组件中 - 使用服务

```typescript
// workbench/parts/FileViewer.tsx
import { useService, useServiceEvent } from '../hooks';
import { IEditorServiceId } from '../../platform/editor/editor';
import type { IEditorService } from '../../platform/editor/editor';

function FileViewer() {
  // 获取服务实例
  const editorService = useService<IEditorService>(IEditorServiceId);
  
  // 自动订阅文件变化事件
  const currentFile = useServiceEvent(
    editorService.onDidChangeActiveFile,
    null
  );
  
  // 调用服务方法
  const [content, setContent] = useState('');
  const loadContent = async () => {
    const text = await editorService.getEditorFullText();
    setContent(text);
  };
  
  return (
    <div>
      <h3>{currentFile || 'No file'}</h3>
      <button onClick={loadContent}>Load</button>
      <pre>{content}</pre>
    </div>
  );
}
```

### 3. 自定义 Hook - 封装复用逻辑

```typescript
// workbench/hooks/useCurrentFile.ts
function useCurrentFile() {
  const editorService = useService<IEditorService>(IEditorServiceId);
  
  const fileName = useServiceEvent(
    editorService.onDidChangeActiveFile,
    null
  );
  
  const [content, setContent] = useState('');
  
  useEffect(() => {
    if (fileName) {
      editorService.getEditorFullText().then(setContent);
    }
  }, [fileName]);
  
  return { fileName, content };
}

// 在多个组件中复用
function ComponentA() {
  const { fileName, content } = useCurrentFile();
  return <div>{fileName}: {content.length} chars</div>;
}
```

## 核心优势

### 1. 类型安全

```typescript
// ✅ 完整的类型推断
const editorService = useService<IEditorService>(IEditorServiceId);
editorService.getCurrentFileName(); // TypeScript 知道这个方法存在

// ✅ 事件类型安全
const file = useServiceEvent(
  editorService.onDidChangeActiveFile, // Event<string | null>
  null // string | null
);
```

### 2. 自动资源管理

```typescript
// ✅ 组件卸载时自动取消订阅
useServiceEvent(service.onDidChange, initialValue);
// 无需手动 dispose()，React Hook 自动处理
```

### 3. 测试友好

```typescript
// 测试时可以 Mock 服务
const mockContainer = new InstantiationService();
mockContainer.registerInstance(IEditorServiceId, {
  getCurrentFileName: jest.fn().mockResolvedValue('test.tex'),
  onDidChangeActiveFile: jest.fn()
});

render(
  <DIProvider container={mockContainer}>
    <MyComponent />
  </DIProvider>
);
```

### 4. 解耦

```typescript
// ✅ 组件不依赖具体实现
function MyComponent() {
  const editorService = useService(IEditorServiceId);
  // 不知道也不关心是 OverleafEditorService 还是 EditorServiceProxy
}
```

### 5. 性能优化

```typescript
// ✅ useMemo 缓存服务实例
// 只在 container 或 serviceId 变化时重新获取
const service = useService(IServiceId);
```

## 与其他系统集成

### Content Script 环境

```typescript
// 使用真实的 DOM 操作服务
const container = new InstantiationService();
container.registerDescriptor(
  new ServiceDescriptor(IEditorServiceId, OverleafEditorService)
);
```

### Sidepanel 环境

```typescript
// 使用 RPC 代理
const container = new InstantiationService();
const rpcClient = new RPCClient(channel);
container.registerInstance(IRPCClientID, rpcClient);
container.registerDescriptor(
  new ServiceDescriptor(IEditorServiceId, EditorServiceProxy, [IRPCClientID])
);
```

**关键点**：组件代码完全相同！只是容器注册的服务实现不同。

## 最佳实践

### 1. 总是指定泛型类型

```typescript
// ✅ 推荐
const service = useService<IEditorService>(IEditorServiceId);

// ❌ 不推荐（TypeScript 可能推断为 unknown）
const service = useService(IEditorServiceId);
```

### 2. 在根组件提供 DIProvider

```typescript
// ✅ 推荐：应用根部
<DIProvider container={container}>
  <App />
</DIProvider>

// ❌ 不推荐：多个 Provider 嵌套（除非确实需要隔离）
```

### 3. 使用自定义 Hook 封装复用逻辑

```typescript
// ✅ 推荐：封装为自定义 Hook
function useCurrentFile() {
  const editorService = useService<IEditorService>(IEditorServiceId);
  const fileName = useServiceEvent(editorService.onDidChangeActiveFile, null);
  return fileName;
}

// 在多个组件中复用
```

### 4. 避免在循环中使用

```typescript
// ❌ 错误：Hook 不能在循环中调用
files.map(() => {
  const service = useService(IServiceId); // React Hook 规则错误
});

// ✅ 正确：在组件顶层调用
const service = useService(IServiceId);
files.map(() => {
  // 使用 service
});
```

## 性能考虑

1. **服务实例缓存**：`useMemo` 确保同一个 serviceId 只创建一次
2. **事件订阅优化**：只在组件挂载时订阅，卸载时取消
3. **避免不必要的重渲染**：使用 `useCallback` 包裹事件处理函数

## 下一步工作

现在基础设施已完善：
- ✅ DI 系统
- ✅ RPC 通信
- ✅ React Hooks

可以开始实现具体功能：
1. **Log Service** - 日志系统
2. **Configuration Service** - 配置管理
3. **Agent Service** - AI 核心
4. **实际的 UI 组件** - 聊天面板、文件浏览器等

## 测试建议

```typescript
import { render } from '@testing-library/react';
import { InstantiationService } from './platform/instantiation';
import { DIProvider } from './workbench/context/DIContext';

describe('useService', () => {
  it('should get service from container', () => {
    const mockService = { test: jest.fn() };
    const container = new InstantiationService();
    container.registerInstance(ITestServiceId, mockService);
    
    function TestComponent() {
      const service = useService(ITestServiceId);
      service.test();
      return null;
    }
    
    render(
      <DIProvider container={container}>
        <TestComponent />
      </DIProvider>
    );
    
    expect(mockService.test).toHaveBeenCalled();
  });
});
```

---

**完成时间**：2025-12-03  
**分支**：建议创建新分支 `feat/react-hooks`  
**状态**：✅ 已完成，可以开始使用

**依赖**：
- 依赖 DI 系统（已完成）
- 依赖 RPC 系统（已完成）
- 需要 React 18+（已安装）
