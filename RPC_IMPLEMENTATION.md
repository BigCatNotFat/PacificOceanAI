# RPC 通信层实现完成报告

## 概述

已完成完整的 RPC（Remote Procedure Call）通信系统，用于解决 Chrome 插件不同上下文（Sidepanel ↔ Content Script）之间的通信问题。

## 问题背景

Chrome 插件的 Sidepanel 和 Content Script 运行在不同的 JavaScript 上下文中：
- **Sidepanel**：无法直接访问页面 DOM
- **Content Script**：可以访问页面 DOM，但与 Sidepanel 隔离

因此需要 RPC 系统来实现跨上下文的方法调用。

## 实现的文件

### 1. 平台接口层（`platform/rpc/`）

**`rpc.ts`** - RPC 核心接口定义
- `RPCRequest` / `RPCResponse`：请求和响应消息格式
- `IRPCChannel`：消息通道抽象接口
- `IRPCServer`：服务端接口
- `IRPCClient`：客户端接口

### 2. 基础层（`base/common/`）

**`rpcChannel.ts`** - 消息通道实现
- `ChromeRuntimeChannel`：使用 `chrome.runtime.sendMessage` 通信（推荐）
- `ChromeTabChannel`：使用 `chrome.tabs.sendMessage` 向特定 Tab 发送消息
- `WindowMessageChannel`：使用 `window.postMessage` 通信（备用方案）

### 3. 服务层（`services/rpc/`）

**`RPCClient.ts`** - RPC 客户端实现
- 发送请求并等待响应
- 自动超时处理（默认 30 秒）
- 请求 ID 生成和管理
- 继承 `Disposable`，支持资源清理

**`RPCServer.ts`** - RPC 服务端实现
- 注册服务方法
- 处理请求并执行方法
- 自动错误捕获和响应
- 支持批量注册服务对象的所有方法

**`example.ts`** - 完整使用示例
- Content Script 端设置示例
- Sidepanel 端设置示例
- 与 DI 容器集成示例

### 4. EditorService 代理（`services/editor/`）

**`EditorServiceProxy.ts`** - EditorService 的 RPC 代理
- 实现 `IEditorService` 接口
- 所有方法通过 RPC 调用 Content Script
- 使用轮询模拟 `onDidChangeActiveFile` 事件
- 使用 `@injectable(IRPCClientID)` 声明依赖

### 5. 接口更新

**`platform/editor/editor.ts`** - 修改接口支持异步
- 所有方法返回值改为 `T | Promise<T>`，同时支持同步和异步实现
- 保持向后兼容性

## 核心架构

```
┌─────────────────────────────────────────────────────────────┐
│                         Sidepanel                            │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  React Component                                       │  │
│  │  使用 useService(IEditorServiceId)                    │  │
│  └────────────────────┬──────────────────────────────────┘  │
│                       │                                       │
│  ┌────────────────────▼──────────────────────────────────┐  │
│  │  EditorServiceProxy (实现 IEditorService)            │  │
│  │  - getCurrentFileName() → rpcClient.call(...)        │  │
│  └────────────────────┬──────────────────────────────────┘  │
│                       │                                       │
│  ┌────────────────────▼──────────────────────────────────┐  │
│  │  RPCClient                                            │  │
│  │  - 生成请求 ID                                        │  │
│  │  - 发送 RPCRequest                                    │  │
│  │  - 等待 RPCResponse                                   │  │
│  └────────────────────┬──────────────────────────────────┘  │
│                       │                                       │
│  ┌────────────────────▼──────────────────────────────────┐  │
│  │  ChromeRuntimeChannel                                 │  │
│  │  chrome.runtime.sendMessage()                         │  │
│  └────────────────────┬──────────────────────────────────┘  │
└────────────────────────┼──────────────────────────────────────┘
                         │ RPC Message (JSON)
┌────────────────────────▼──────────────────────────────────────┐
│                      Content Script                           │
│  ┌───────────────────────────────────────────────────────┐   │
│  │  ChromeRuntimeChannel                                 │   │
│  │  chrome.runtime.onMessage.addListener()               │   │
│  └────────────────────┬──────────────────────────────────┘   │
│                       │                                        │
│  ┌────────────────────▼──────────────────────────────────┐   │
│  │  RPCServer                                            │   │
│  │  - 接收 RPCRequest                                    │   │
│  │  - 查找注册的方法                                      │   │
│  │  - 执行方法                                           │   │
│  │  - 返回 RPCResponse                                   │   │
│  └────────────────────┬──────────────────────────────────┘   │
│                       │                                        │
│  ┌────────────────────▼──────────────────────────────────┐   │
│  │  OverleafEditorService (真实实现)                    │   │
│  │  - getCurrentFileName() → 操作 DOM                   │   │
│  │  - readLine() → 读取页面元素                         │   │
│  └───────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────┘
```

## 使用示例

### Content Script 端（服务器）

```typescript
import { ChromeRuntimeChannel } from '../../base/common/rpcChannel';
import { RPCServer } from '../../services/rpc/RPCServer';
import { OverleafEditorService } from '../../services/editor/OverleafEditorService';

// 1. 创建通道和服务器
const channel = new ChromeRuntimeChannel();
const rpcServer = new RPCServer(channel);

// 2. 创建真实的服务实例
const editorService = new OverleafEditorService();

// 3. 注册服务方法
rpcServer.registerService(editorService);

// 4. 启动服务器
rpcServer.start();
```

### Sidepanel 端（客户端）

```typescript
import { ChromeRuntimeChannel } from '../../base/common/rpcChannel';
import { RPCClient } from '../../services/rpc/RPCClient';
import { EditorServiceProxy } from '../../services/editor/EditorServiceProxy';

// 1. 创建通道和客户端
const channel = new ChromeRuntimeChannel();
const rpcClient = new RPCClient(channel, { timeout: 30000 });

// 2. 创建代理
const editorService = new EditorServiceProxy(rpcClient);

// 3. 使用代理（自动通过 RPC 调用）
const fileName = await editorService.getCurrentFileName();
const content = await editorService.getEditorFullText();
```

### 与 DI 容器集成

```typescript
// Content Script
di.registerDescriptor(new ServiceDescriptor(IEditorServiceId, OverleafEditorService));
di.registerInstance(IRPCServerID, new RPCServer(channel));

const rpcServer = di.getService(IRPCServerID);
const editorService = di.getService(IEditorServiceId);
rpcServer.registerService(editorService);
rpcServer.start();

// Sidepanel
di.registerInstance(IRPCClientID, new RPCClient(channel));
di.registerDescriptor(new ServiceDescriptor(IEditorServiceId, EditorServiceProxy, [IRPCClientID]));

const editorService = di.getService(IEditorServiceId); // 自动创建代理
```

## 核心特性

1. **类型安全**：完整的 TypeScript 类型支持
2. **超时处理**：自动超时检测（默认 30 秒）
3. **错误处理**：自动捕获异常并返回错误响应
4. **资源管理**：继承 `Disposable`，支持清理
5. **请求追踪**：每个请求有唯一 ID
6. **批量注册**：支持一次性注册服务对象的所有方法
7. **多通道支持**：支持多种通信方式（Runtime / Tab / Window）

## 架构优势

1. **透明性**：上层代码无需关心 RPC 细节，像调用本地方法一样
2. **可测试**：可以 Mock RPCClient 进行单元测试
3. **可扩展**：轻松添加新的通信通道
4. **解耦**：服务实现和通信逻辑完全分离
5. **DI 集成**：完美集成依赖注入系统

## 性能考虑

- **事件模拟**：`onDidChangeActiveFile` 使用轮询（1 秒间隔），未来可优化为推送模式
- **序列化开销**：所有参数和返回值需要 JSON 序列化
- **网络延迟**：Chrome 消息传递通常很快（< 10ms），但仍有开销

## 下一步工作

1. **优化事件系统**：实现基于推送的事件通知，替代轮询
2. **添加日志**：集成 LogService 记录 RPC 调用
3. **性能监控**：记录 RPC 调用耗时和成功率
4. **批量请求**：支持一次发送多个请求
5. **重连机制**：处理连接断开和重连

## 测试建议

```typescript
// 测试 RPC 客户端
const mockChannel = {
  send: jest.fn(),
  onMessage: jest.fn()
};
const client = new RPCClient(mockChannel);
await client.call('testMethod', 'arg1', 'arg2');

// 测试 RPC 服务器
const server = new RPCServer(mockChannel);
server.registerMethod('testMethod', (a, b) => a + b);
server.start();
```

## 已知限制

1. **无法传递函数**：参数和返回值必须可 JSON 序列化
2. **单向通信**：服务端无法主动推送事件给客户端（使用轮询模拟）
3. **跨 Tab 限制**：默认只能与当前活动 Tab 通信

---

**完成时间**：2025-12-03  
**分支**：`feat/RPC_12_3`  
**状态**：✅ 已完成，可以合并到主分支

**依赖**：
- 依赖 DI 系统（`feat/DI` 已合并）
- 修改了 `IEditorService` 接口（向后兼容）
