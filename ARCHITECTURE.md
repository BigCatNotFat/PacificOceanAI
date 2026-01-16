# Overleaf AI Assistant - 架构文档

> 本文档是 Overleaf AI Assistant 浏览器插件的开发指南。所有代码提交必须严格遵守本文档定义的架构原则、目录结构和代码模式。

**最后更新**: 2026-01-16

---

## 📑 目录

### 第一部分：核心概念

#### [1. 项目概述](#1-项目概述)
- 1.1 项目简介
- 1.2 技术栈
- 1.3 插件架构概览

#### [2. 核心设计哲学](#2-核心设计哲学)
- 2.1 四大铁律
  - 2.1.1 单向依赖 (Strict Layering)
  - 2.1.2 依赖注入 (Dependency Injection)
  - 2.1.3 接口分离 (Interface Separation)
  - 2.1.4 生命周期管理 (Disposable Pattern)

#### [3. 目录结构规范](#3-目录结构规范)
- 3.1 完整目录树
- 3.2 关键目录说明
  - 3.2.1 `base/` - 基础层
  - 3.2.2 `platform/` - 接口层
  - 3.2.3 `services/` - 业务实现层
  - 3.2.4 `workbench/` - UI 层
  - 3.2.5 `extension/` - 插件入口
  - 3.2.6 `public/injected/` - 注入脚本

#### [4. 架构分层详解](#4-架构分层详解)
- 4.1 层级概览
- 4.2 Level 1: Base（地基）
- 4.3 Level 2: Platform（契约）
- 4.4 Level 3: Services（核心）
- 4.5 Level 4: Workbench（皮肤）

---

### 第二部分：核心系统

#### [5. 依赖注入系统 (DI)](#5-依赖注入系统-di)
- 5.1 为什么需要依赖注入？
- 5.2 DI 系统核心概念
  - 5.2.1 ServiceIdentifier（服务标识符）
  - 5.2.2 ServiceDescriptor（服务描述符）
  - 5.2.3 ServiceCollection（服务集合）
  - 5.2.4 InstantiationService（DI 容器）
  - 5.2.5 @injectable 装饰器
- 5.3 DI 使用流程
  - 5.3.1 第一步：定义接口（Platform 层）
  - 5.3.2 第二步：实现服务（Services 层）
  - 5.3.3 第三步：注册服务（入口文件）
  - 5.3.4 第四步：使用服务
- 5.4 依赖关系图
- 5.5 最佳实践
  - 5.5.1 服务应该是单例
  - 5.5.2 避免循环依赖
  - 5.5.3 接口隔离原则
  - 5.5.4 依赖倒置原则

#### [6. RPC 通信系统](#6-rpc-通信系统)
- 6.1 为什么需要 RPC？
- 6.2 RPC 架构概览
- 6.3 RPC 核心组件
  - 6.3.1 IRPCChannel（RPC 通道抽象）
  - 6.3.2 RPCClient（RPC 客户端）
  - 6.3.3 RPCServer（RPC 服务端）
  - 6.3.4 ServiceProxy（服务代理）
- 6.4 RPC 消息格式
  - 6.4.1 请求消息
  - 6.4.2 响应消息
- 6.5 RPC 调用示例
  - 6.5.1 Sidepanel 端（客户端）
  - 6.5.2 Content Script 端（服务端）
- 6.6 RPC 最佳实践
  - 6.6.1 方法应该是纯函数
  - 6.6.2 避免频繁调用
  - 6.6.3 处理超时和错误
  - 6.6.4 类型安全

#### [7. 编辑器桥接系统](#7-编辑器桥接系统)
- 7.1 为什么需要桥接系统？
- 7.2 桥接架构概览
- 7.3 核心组件详解
  - 7.3.1 overleafBridge.js（注入脚本）
  - 7.3.2 OverleafBridgeClient（桥接客户端）
  - 7.3.3 编辑器模块系统
- 7.4 搜索功能详解
- 7.5 文本操作预览系统
- 7.6 选区工具提示
- 7.7 桥接系统最佳实践
  - 7.7.1 方法命名规范
  - 7.7.2 参数设计
  - 7.7.3 错误处理
  - 7.7.4 性能优化

#### [8. 存储系统](#8-存储系统)
- 8.1 存储需求
- 8.2 存储类型
  - 8.2.1 chrome.storage.local
  - 8.2.2 chrome.storage.sync
- 8.3 存储服务架构
- 8.4 IStorageService 接口
- 8.5 存储键命名规范
- 8.6 数据序列化
- 8.7 存储最佳实践
  - 8.7.1 避免频繁写入
  - 8.7.2 数据版本管理
  - 8.7.3 敏感信息保护
  - 8.7.4 容量管理

---

### 第三部分：业务系统

#### [9. Agent 与对话系统](#9-agent-与对话系统)
- 9.1 系统架构
  - 9.1.1 服务分层
- 9.2 核心服务详解
  - 9.2.1 ChatService（会话管理）
  - 9.2.2 AgentService（Agent Loop 核心）
  - 9.2.3 PromptService（提示词构建）
- 9.3 对话消息结构
  - 9.3.1 ChatMessage（UI 消息）
  - 9.3.2 LLMMessage（LLM 消息）
- 9.4 上下文管理
  - 9.4.1 ContextItem（上下文项）
  - 9.4.2 上下文提供者
- 9.5 会话持久化
  - 9.5.1 ConversationService
  - 9.5.2 自动标题生成
- 9.6 流式响应处理
  - 9.6.1 为什么需要流式响应？
  - 9.6.2 流式处理流程
  - 9.6.3 思考标签解析
- 9.7 错误处理
  - 9.7.1 常见错误类型
  - 9.7.2 错误处理策略

#### [10. 工具系统 (Tools)](#10-工具系统-tools)
- 10.1 工具系统架构
- 10.2 ITool 接口
- 10.3 工具实现详解
  - 10.3.1 BaseTool（工具基类）
  - 10.3.2 ReadFileTool（读取文件）
  - 10.3.3 EditFileTool（编辑文件）
  - 10.3.4 GrepSearchTool（文本搜索）
  - 10.3.5 LatexCodeBaseSearch（LaTeX 语义搜索）
  - 10.3.6 ListDirTool（列出文件）
  - 10.3.7 WebSearchTool（网络搜索）
  - 10.3.8 PaperSemanticSearchTool（论文搜索）
- 10.4 ToolService 实现
- 10.5 工具注册流程
- 10.6 工具调用流程
- 10.7 工具开发规范
  - 10.7.1 工具命名
  - 10.7.2 参数设计
  - 10.7.3 错误处理
  - 10.7.4 幂等性
  - 10.7.5 文档
- 10.8 工具审批设计

#### [11. LLM 服务与适配器](#11-llm-服务与适配器)
- 11.1 LLM 服务架构
- 11.2 核心概念
  - 11.2.1 为什么需要适配器？
  - 11.2.2 ModelRegistryService（模型注册表）
- 11.3 适配器系统
  - 11.3.1 BaseLLMProvider（适配器基类）
  - 11.3.2 OpenAIAdapter
  - 11.3.3 OpenAICompatibleAdapter
  - 11.3.4 AnthropicAdapter
- 11.4 LLMProviderService 实现
- 11.5 LLMService 实现
- 11.6 流式响应处理
  - 11.6.1 Server-Sent Events (SSE)
  - 11.6.2 增量拼接
- 11.7 错误处理
  - 11.7.1 常见错误
  - 11.7.2 重试策略
- 11.8 模型配置
  - 11.8.1 ModelConfig
  - 11.8.2 用户配置
- 11.9 多模态支持
  - 11.9.1 图片输入

#### [12. 文本操作系统](#12-文本操作系统)
- 12.1 系统概述
- 12.2 系统架构
- 12.3 核心组件
  - 12.3.1 overleafBridge.js - 选区工具提示
  - 12.3.2 TextActionService（Content Script）
  - 12.3.3 TextActionAIService（Sidepanel）
- 12.4 预览系统
  - 12.4.1 预览覆盖层
  - 12.4.2 流式预览流程
  - 12.4.3 取消机制
- 12.5 上下文感知
- 12.6 模型选择
- 12.7 错误处理
- 12.8 性能优化

---

### 第四部分：用户界面

#### [13. Workbench 层 (UI)](#13-workbench-层-ui)
- 13.1 Workbench 设计原则
- 13.2 核心组件
  - 13.2.1 App.tsx（应用根组件）
  - 13.2.2 Sidebar.tsx（侧边栏）
  - 13.2.3 ConversationPane.tsx（对话面板）
  - 13.2.4 MarkdownRenderer.tsx（Markdown 渲染器）
  - 13.2.5 ToolResultRenderer.tsx（工具结果渲染器）
  - 13.2.6 RichTextInput.tsx（富文本输入框）
  - 13.2.7 ActivationModal.tsx（激活弹窗）
- 13.3 样式系统
  - 13.3.1 CSS Modules vs Tailwind
  - 13.3.2 设计规范
- 13.4 响应式设计
  - 13.4.1 Sidepanel 宽度
  - 13.4.2 消息列表滚动
  - 13.4.3 移动端适配
- 13.5 无障碍（Accessibility）
  - 13.5.1 键盘导航
  - 13.5.2 ARIA 标签
  - 13.5.3 颜色对比

#### [14. React Hooks 系统](#14-react-hooks-系统)
- 14.1 Hooks 架构
- 14.2 核心 Hooks
  - 14.2.1 useService
  - 14.2.2 useServiceEvent
  - 14.2.3 useChatMessages
  - 14.2.4 useConversations
  - 14.2.5 useTextAction
  - 14.2.6 useStorage
  - 14.2.7 useUIStreamUpdates
- 14.3 DIContext 提供者
- 14.4 自定义 Hook 开发规范
  - 14.4.1 命名规范
  - 14.4.2 单一职责
  - 14.4.3 清理资源
  - 14.4.4 依赖数组
  - 14.4.5 TypeScript 支持

---

### 第五部分：开发指南

#### [15. 标准开发流程](#15-标准开发流程)
- 15.1 添加新的 AI 工具
- 15.2 添加新的全局功能
- 15.3 添加新的 LLM 模型
- 15.4 修改 UI 组件

#### [16. 开发规范与检查清单](#16-开发规范与检查清单)
- 16.1 代码规范
  - 16.1.1 TypeScript
  - 16.1.2 命名规范
  - 16.1.3 注释规范
- 16.2 架构检查清单
- 16.3 Git 规范
  - 16.3.1 提交信息
  - 16.3.2 分支策略

#### [17. 常见问题与解决方案](#17-常见问题与解决方案)
- 17.1 依赖注入相关
- 17.2 RPC 通信相关
- 17.3 编辑器桥接相关
- 17.4 LLM 调用相关
- 17.5 性能相关

---

### 附录
- A. 核心口号
- B. 推荐阅读
- C. 联系方式

---

## 第一部分：核心概念

---

## 1. 项目概述

### 1.1 项目简介

Overleaf AI Assistant 是一个为 Overleaf 在线 LaTeX 编辑器设计的浏览器插件，旨在通过 AI 技术增强学术写作体验。

**核心功能**：
- **智能对话助手**：基于 Agent 架构的多轮对话系统，支持工具调用
- **文本操作**：选区文本的扩写、缩写、润色、翻译等
- **代码编辑**：AI 辅助的 LaTeX 代码修改与优化
- **项目搜索**：全项目范围的语义搜索和文本搜索
- **上下文感知**：自动获取当前文件、选区、大纲等上下文信息

### 1.2 技术栈

- **前端框架**: React 18 + TypeScript
- **构建工具**: Vite
- **浏览器 API**: Chrome Extension Manifest V3
- **AI 服务**: OpenAI / Anthropic / Gemini / DeepSeek 等多厂商支持
- **架构模式**: 微内核 + 依赖注入（参考 VS Code）

### 1.3 插件架构概览

Overleaf AI Assistant 采用 **多进程架构**，各部分职责清晰：

```
┌─────────────────────────────────────────────────────────────┐
│                      用户浏览器                              │
├─────────────────────────────────────────────────────────────┤
│  Overleaf 页面 (www.overleaf.com)                           │
│  ┌──────────────────────┐  ┌──────────────────────┐         │
│  │  Content Script      │  │  Injected Script     │         │
│  │  (隔离环境)           │◄─┤  (页面主世界)        │         │
│  │  - RPC Server        │  │  - overleafBridge.js │         │
│  │  - Editor Service    │  │  - DOM 操作          │         │
│  │  - Text Action       │  │  - EditorView 访问   │         │
│  └──────────┬───────────┘  └──────────────────────┘         │
│             │                                                │
│             │ chrome.runtime.sendMessage                     │
│             │                                                │
├─────────────┼────────────────────────────────────────────────┤
│  Sidepanel / Popup (插件 UI)                                 │
│  ┌──────────┴───────────┐                                    │
│  │  React App           │                                    │
│  │  - Workbench (UI)    │                                    │
│  │  - Services (Logic)  │                                    │
│  │  - DI Container      │                                    │
│  │  - RPC Client        │                                    │
│  └──────────────────────┘                                    │
└─────────────────────────────────────────────────────────────┘
```

**关键点**：
- **Content Script** 运行在隔离环境，可访问 DOM 但不能访问页面 JS 对象
- **Injected Script** (overleafBridge.js) 运行在页面主世界，可访问 `window.overleaf` 等内部 API
- **Sidepanel/Popup** 提供用户界面，通过 RPC 与 Content Script 通信
- 三者通过 **消息传递** (postMessage + chrome.runtime.sendMessage) 协作

---

## 2. 核心设计哲学

本项目借鉴 **VS Code 的微内核架构思想**，旨在构建一个高内聚、低耦合、易于扩展的浏览器插件。

### 2.1 四大铁律

#### 2.1.1 单向依赖 (Strict Layering)

**架构层级**：
```
Workbench (UI) → Services (Logic) → Platform (Interfaces) → Base (Utils)
```

**原则**：
- 上层只能依赖下层，下层绝对不能引用上层
- 禁止循环依赖
- 如果需要下层通知上层，使用**事件 (Event)** 机制

**示例**：
- ✅ 正确：`ChatPanel.tsx` (Workbench) 依赖 `IChatService` (Platform)
- ❌ 错误：`ChatService.ts` (Services) 依赖 `ChatPanel.tsx` (Workbench)
- ✅ 正确：`ChatService` 通过事件 `onDidMessageUpdate` 通知 UI 更新

#### 2.1.2 依赖注入 (Dependency Injection)

**核心原则**：
- 禁止在组件中直接实例化业务类 (不使用 `new Class()`)
- 所有功能封装为**服务 (Service)**
- 通过**接口 (Interface)** 声明依赖，由 **DI 容器**自动注入

**DI 系统核心组件**：
- `ServiceIdentifier<T>`：服务的唯一标识符（Symbol）
- `ServiceCollection`：存储服务实例的容器
- `ServiceDescriptor`：描述如何创建服务（构造函数 + 依赖列表）
- `InstantiationService`：DI 容器核心，自动解析并注入依赖
- `@injectable(...deps)`：装饰器，声明类的构造函数依赖

**为什么使用依赖注入？**
- **可测试性**：可以轻松 mock 依赖进行单元测试
- **可替换性**：可以替换服务实现而不影响上层代码
- **解耦**：服务之间通过接口通信，降低耦合度

#### 2.1.3 接口分离 (Interface Separation)

**开发顺序**：
1. 先定义"做什么"（Interface，存放在 `platform/`）
2. 再实现"怎么做"（Implementation，存放在 `services/`）

**规则**：
- Platform 层只定义 `interface` 和 `ServiceIdentifier`
- Services 层实现具体逻辑
- UI 层只引用 Interface，绝不引用 Service 具体类

**好处**：
- 接口即契约，一旦定义就保持稳定
- 实现可以随意修改而不影响上层
- 支持多种实现（如测试实现、生产实现）

#### 2.1.4 生命周期管理 (Disposable Pattern)

**规则**：
- 所有包含事件监听、定时器、DOM 绑定的类，必须继承 `Disposable` 基类
- 必须实现 `dispose()` 方法以清理资源，防止内存泄漏
- React 组件卸载时，应调用服务的 `dispose()` 方法

**常见需要 dispose 的场景**：
- 事件监听器（`addEventListener`）
- 定时器（`setTimeout`, `setInterval`）
- RPC 连接
- 流式响应

---

## 3. 目录结构规范

### 3.1 完整目录树

```
overleaf-ai-react/
├── src/
│   ├── base/                   # [L1] 基础库（严禁包含业务逻辑）
│   │   ├── browser/            # 浏览器 API 封装
│   │   │   ├── dom.ts          # DOM 工具函数
│   │   │   └── storage.ts      # 存储工具
│   │   └── common/             # 通用工具
│   │       ├── constants.ts    # 全局常量
│   │       ├── disposable.ts   # 生命周期管理基类
│   │       ├── event.ts        # 事件系统（Emitter/Event）
│   │       └── rpcChannel.ts   # RPC 通道抽象
│   │
│   ├── platform/               # [L2] 接口定义层（只定义 Interface）
│   │   ├── agent/              # Agent 相关接口
│   │   │   ├── IAgentService.ts         # Agent Loop 编排接口
│   │   │   ├── IChatService.ts          # 对话管理接口
│   │   │   ├── IConversationService.ts  # 会话持久化接口
│   │   │   ├── IPromptService.ts        # 提示词构建接口
│   │   │   ├── ITextActionAIService.ts  # 文本操作 AI 接口
│   │   │   ├── IToolService.ts          # 工具服务接口
│   │   │   └── IUIStreamService.ts      # UI 流式更新接口
│   │   ├── configuration/      # 配置服务接口
│   │   │   └── configuration.ts
│   │   ├── editor/             # 编辑器服务接口
│   │   │   └── editor.ts       # IEditorService（读写文件、获取上下文）
│   │   ├── instantiation/      # 依赖注入核心
│   │   │   ├── descriptors.ts           # ServiceDescriptor
│   │   │   ├── index.ts                 # 导出
│   │   │   ├── instantiationService.ts  # DI 容器实现
│   │   │   └── serviceCollection.ts     # 服务集合
│   │   ├── llm/                # LLM 相关接口
│   │   │   ├── ILLMService.ts           # LLM 调用接口
│   │   │   └── IModelRegistryService.ts # 模型注册表接口
│   │   ├── rpc/                # RPC 接口
│   │   │   └── rpc.ts          # IRPCChannel, IRPCProtocol
│   │   ├── storage/            # 存储接口
│   │   │   └── storage.ts      # IStorageService
│   │   └── tools/              # 工具接口
│   │       ├── ITool.ts        # 工具基础接口
│   │       └── tool.ts         # 工具相关类型
│   │
│   ├── services/               # [L3] 业务实现层（具体的逻辑代码）
│   │   ├── agent/              # Agent 相关服务
│   │   │   ├── AgentService.ts          # Agent Loop 核心实现
│   │   │   ├── ChatService.ts           # 对话管理实现
│   │   │   ├── ConversationService.ts   # 会话持久化实现
│   │   │   ├── PromptService.ts         # 提示词构建实现
│   │   │   ├── TextActionAIService.ts   # 文本操作 AI 实现
│   │   │   ├── ToolService.ts           # 工具管理实现
│   │   │   ├── UIStreamService.ts       # UI 流式更新实现
│   │   │   └── tools/                   # 工具实现
│   │   │       ├── base/
│   │   │       │   ├── BaseTool.ts      # 工具基类
│   │   │       │   └── ITool.ts         # 工具接口（具体）
│   │   │       ├── implementations/     # 具体工具实现
│   │   │       │   ├── DeleteFileTool.ts
│   │   │       │   ├── DiffHistoryTool.ts
│   │   │       │   ├── EditFileTool.ts
│   │   │       │   ├── GrepSearchTool.ts
│   │   │       │   ├── LatexCodeBaseSearch.ts
│   │   │       │   ├── ListDirTool.ts
│   │   │       │   ├── PaperBooleanSearchTool.ts
│   │   │       │   ├── PaperSemanticSearchTool.ts
│   │   │       │   ├── ReadFileTool.ts
│   │   │       │   ├── ReapplyTool.ts
│   │   │       │   ├── ReplaceLinesTool.ts
│   │   │       │   ├── SearchReplaceTool.ts
│   │   │       │   └── WebSearchTool.ts
│   │   │       ├── utils/
│   │   │       │   └── DiffMatchPatchService.ts
│   │   │       ├── index.ts
│   │   │       └── ToolRegistry.ts      # 工具注册表
│   │   ├── configuration/      # 配置服务实现
│   │   │   ├── ConfigurationService.ts
│   │   │   └── index.ts
│   │   ├── editor/             # 编辑器服务实现
│   │   │   ├── bridge/                  # 桥接客户端
│   │   │   │   ├── index.ts
│   │   │   │   ├── OverleafBridgeClient.ts
│   │   │   │   └── types.ts
│   │   │   ├── modules/                 # 编辑器模块
│   │   │   │   ├── BaseModule.ts        # 模块基类
│   │   │   │   ├── DocumentModule.ts    # 文档操作模块
│   │   │   │   ├── EditorModule.ts      # 编辑器模块
│   │   │   │   ├── FileModule.ts        # 文件操作模块
│   │   │   │   ├── ProjectModule.ts     # 项目模块
│   │   │   │   ├── SelectionModule.ts   # 选区模块
│   │   │   │   └── index.ts
│   │   │   ├── EditorServiceProxy.ts    # 编辑器服务代理（RPC 客户端）
│   │   │   ├── OverleafBridgeClient.ts  # 桥接客户端
│   │   │   ├── OverleafEditor.ts        # 编辑器包装类
│   │   │   ├── OverleafEditorService.ts # 编辑器服务实现（Content Script）
│   │   │   └── TextActionService.ts     # 文本操作服务
│   │   ├── llm/                # LLM 服务实现
│   │   │   ├── adapters/                # LLM 厂商适配器
│   │   │   │   ├── AnthropicProvider.ts
│   │   │   │   ├── BaseLLMProvider.ts   # 适配器基类
│   │   │   │   ├── GeminiProvider.ts
│   │   │   │   ├── OpenAICompatibleProvider.ts
│   │   │   │   └── OpenAIProvider.ts
│   │   │   ├── LLMService.ts            # LLM 服务实现
│   │   │   └── ModelRegistryService.ts  # 模型注册表实现
│   │   ├── rpc/                # RPC 实现
│   │   │   ├── example.ts
│   │   │   ├── RPCClient.ts             # RPC 客户端
│   │   │   └── RPCServer.ts             # RPC 服务端
│   │   └── storage/            # 存储服务实现
│   │       ├── index.ts
│   │       ├── StorageService.ts        # 存储服务实现（Content Script）
│   │       └── StorageServiceProxy.ts   # 存储服务代理（RPC 客户端）
│   │
│   ├── workbench/              # [L4] UI 表现层（React 组件）
│   │   ├── context/            # React Context
│   │   │   └── DIContext.tsx   # DI 容器 Provider
│   │   ├── hooks/              # React Hooks
│   │   │   ├── index.ts
│   │   │   ├── useChatMessages.ts       # 对话消息 Hook
│   │   │   ├── useConversations.ts      # 会话列表 Hook
│   │   │   ├── useModelListSync.ts      # 模型列表同步 Hook
│   │   │   ├── useService.ts            # 获取服务实例 Hook
│   │   │   ├── useServiceEvent.ts       # 订阅服务事件 Hook
│   │   │   ├── useSidebarResize.ts      # 侧边栏大小调整 Hook
│   │   │   ├── useStorage.ts            # 存储 Hook
│   │   │   ├── useTextAction.ts         # 文本操作 Hook
│   │   │   └── useUIStreamUpdates.ts    # UI 流式更新 Hook
│   │   ├── parts/              # UI 组件
│   │   │   ├── ActivationModal.tsx      # 激活弹窗
│   │   │   ├── App.tsx                  # 应用根组件
│   │   │   ├── ConversationPane.tsx     # 对话面板
│   │   │   ├── MarkdownRenderer.tsx     # Markdown 渲染器
│   │   │   ├── MultiPaneContainer.tsx   # 多面板容器
│   │   │   ├── OptionsApp.tsx           # 选项页应用
│   │   │   ├── PopupApp.tsx             # Popup 应用
│   │   │   ├── RichTextInput.tsx        # 富文本输入框
│   │   │   ├── Sidebar.tsx              # 侧边栏
│   │   │   ├── TextActionProvider.tsx   # 文本操作提供者
│   │   │   ├── ToolbarButtonPortal.tsx  # 工具栏按钮传送门
│   │   │   └── ToolResultRenderer.tsx   # 工具结果渲染器
│   │   ├── styles/             # 样式文件
│   │   │   ├── popup.css
│   │   │   └── sidebar.css
│   │   └── types/              # 类型定义
│   │       └── chat.ts         # 对话相关类型
│   │
│   └── extension/              # [Entry] 插件入口
│       ├── content/            # Content Script（注入页面，负责 DOM 操作）
│       │   └── main.tsx
│       ├── options/            # 选项页
│       │   ├── index.html
│       │   └── main.tsx
│       └── popup/              # Popup 页面
│           ├── index.html
│           └── main.tsx
│
├── public/
│   ├── images/                 # 图片资源
│   └── injected/
│       └── overleafBridge.js   # 注入到页面主世界的脚本
│
├── dist/                       # 构建输出目录
├── manifest.config.ts          # Manifest 配置
├── vite.config.ts              # Vite 配置
├── tsconfig.json               # TypeScript 配置
└── package.json                # 依赖配置
```

### 3.2 关键目录说明

#### 3.2.1 `base/` - 基础层
- **职责**：提供通用工具函数和基础类，类似于 lodash
- **规则**：严禁包含业务逻辑，严禁依赖上层
- **内容**：事件系统、生命周期管理、RPC 通道抽象

#### 3.2.2 `platform/` - 接口层
- **职责**：定义系统的"骨架"，只有接口定义
- **规则**：只定义 interface 和 ServiceIdentifier，严禁包含实现逻辑
- **内容**：所有服务的接口定义

#### 3.2.3 `services/` - 业务实现层
- **职责**：实现 Platform 中定义的接口
- **规则**：可以依赖 Platform 和 Base，不能依赖 Workbench
- **内容**：所有服务的具体实现

#### 3.2.4 `workbench/` - UI 层
- **职责**：React 界面展示
- **规则**：严禁包含业务逻辑，只能通过 useService() 获取服务
- **内容**：React 组件、Hooks、样式

#### 3.2.5 `extension/` - 插件入口
- **职责**：浏览器插件的入口文件
- **内容**：Content Script、Options、Popup 的入口

#### 3.2.6 `public/injected/` - 注入脚本
- **职责**：运行在页面主世界，访问 Overleaf 内部 API
- **内容**：overleafBridge.js（详见第 7 章）

---

## 4. 架构分层详解

### 4.1 层级概览

```
┌────────────────────────────────────────────────────────────┐
│  Level 4: Workbench (表现层)                                │
│  - React 组件                                               │
│  - Hooks (useService, useServiceEvent)                     │
│  - 只负责展示，不包含业务逻辑                                │
└──────────────────────┬─────────────────────────────────────┘
                       │ 依赖
                       ▼
┌────────────────────────────────────────────────────────────┐
│  Level 3: Services (业务层)                                 │
│  - 服务实现类 (ChatService, ToolService...)                │
│  - 实现 Platform 定义的接口                                 │
│  - 包含具体业务逻辑                                          │
└──────────────────────┬─────────────────────────────────────┘
                       │ 依赖
                       ▼
┌────────────────────────────────────────────────────────────┐
│  Level 2: Platform (契约层)                                 │
│  - 接口定义 (IEditorService, IChatService...)              │
│  - ServiceIdentifier (Symbol)                              │
│  - 只定义契约，不包含实现                                    │
└──────────────────────┬─────────────────────────────────────┘
                       │ 依赖
                       ▼
┌────────────────────────────────────────────────────────────┐
│  Level 1: Base (基础层)                                     │
│  - 通用工具 (Event, Disposable)                            │
│  - 浏览器 API 封装                                          │
│  - 不包含任何业务概念                                        │
└────────────────────────────────────────────────────────────┘
```

### 4.2 Level 1: Base（地基）

**职责**：提供通用能力，类似于 lodash 或 utils

**规则**：
- ✅ 可以包含：工具函数、基础类、类型定义
- ❌ 不能包含：业务逻辑、服务概念、UI 组件
- ❌ 不能依赖：platform、services、workbench

**核心文件**：
- `event.ts`: 事件发射器 Emitter 和事件类型 Event
- `disposable.ts`: 生命周期管理基类 Disposable
- `rpcChannel.ts`: RPC 通道抽象 IRPCChannel
- `storage.ts`: 浏览器存储封装
- `dom.ts`: DOM 工具函数

### 4.3 Level 2: Platform（契约）

**职责**：定义系统的"骨架"，只有接口定义

**规则**：
- ✅ 可以包含：interface、type、enum、ServiceIdentifier
- ❌ 不能包含：具体实现、业务逻辑、实例化代码
- ✅ 可以依赖：Base 层
- ❌ 不能依赖：Services 层、Workbench 层

**开发流程**：
1. 需要新功能时，先在 Platform 层定义接口
2. 再在 Services 层实现接口
3. 最后在 Workbench 层使用接口

**核心接口**：
- `IEditorService`: 编辑器操作（读写文件、获取上下文）
- `IChatService`: 对话管理
- `IAgentService`: Agent Loop 编排
- `IToolService`: 工具管理
- `ILLMService`: LLM 调用
- `IStorageService`: 存储服务

### 4.4 Level 3: Services（核心）

**职责**：实现 Platform 中定义的接口，包含具体业务逻辑

**规则**：
- ✅ 必须实现 Platform 层定义的接口
- ✅ 可以依赖：Platform 层、Base 层、其他 Service（通过 DI）
- ❌ 不能依赖：Workbench 层
- ✅ 如果需要通知 UI，使用事件机制

**命名规范**：
- 实现类命名：`XxxService`（如 ChatService）
- 接口命名：`IXxxService`（如 IChatService）
- 服务标识符：`IXxxServiceId`（如 IChatServiceId）

**服务职责划分**：
- **单一职责**：一个服务只做一件事
- **职责分离**：避免"上帝类"（God Class）
- **适当拆分**：如果服务超过 500 行，考虑拆分

### 4.5 Level 4: Workbench（皮肤）

**职责**：React 界面展示

**规则**：
- ✅ 可以使用：React Hooks、useService、useServiceEvent
- ❌ 禁止包含：复杂业务逻辑、直接调用 API、直接操作 DOM
- ✅ 状态管理：通过 service.onDidXxx 事件更新 React State
- ❌ 不要手动轮询状态

**React 组件开发规范**：
- 组件应该"哑巴"（Dumb）：只负责展示
- 所有逻辑在 Service 层完成
- 通过 Hooks 连接 Service 和 UI

---

## 第二部分：核心系统

---

## 5. 依赖注入系统 (DI)

### 5.1 为什么需要依赖注入？

**传统方式的问题**：

当我们直接在类中实例化依赖时，会导致：
- **强耦合**：类与具体实现绑定，难以替换
- **难以测试**：无法在测试中替换依赖为 mock 对象
- **依赖关系不清晰**：不知道一个类依赖了哪些其他类
- **循环依赖问题**：手动管理依赖容易出现循环引用

**依赖注入的优势**：
- **松耦合**：类依赖接口而非实现
- **可测试**：可以注入 mock 实现进行单元测试
- **依赖关系清晰**：通过装饰器声明依赖
- **自动解析**：DI 容器自动解析并注入依赖

### 5.2 DI 系统核心概念

#### 5.2.1 ServiceIdentifier（服务标识符）

每个服务都有一个唯一的 Symbol 标识符：

**定义位置**：`platform/` 层，与接口定义在同一文件

**命名规范**：`IXxxServiceId`

**作用**：
- 在 DI 容器中唯一标识一个服务
- 避免字符串标识符的冲突问题
- 类型安全

#### 5.2.2 ServiceDescriptor（服务描述符）

描述如何创建一个服务：

**属性**：
- `id`: ServiceIdentifier - 服务标识符
- `ctor`: Constructor - 服务构造函数
- `deps`: ServiceIdentifier[] - 依赖的其他服务

**作用**：
- 告诉 DI 容器如何实例化服务
- 声明服务的依赖关系

#### 5.2.3 ServiceCollection（服务集合）

存储已注册的服务实例和描述符：

**职责**：
- 管理服务的单例实例
- 管理服务的描述符
- 提供查询接口

#### 5.2.4 InstantiationService（DI 容器）

依赖注入的核心，负责：
- 解析服务依赖关系
- 按依赖顺序实例化服务
- 管理服务生命周期
- 检测循环依赖

#### 5.2.5 @injectable 装饰器

声明类的构造函数依赖：

**语法**：`@injectable(...deps)`

**作用**：
- 告诉 DI 容器这个类需要哪些依赖
- 依赖会按顺序注入到构造函数

### 5.3 DI 使用流程

#### 5.3.1 第一步：定义接口（Platform 层）

在 `platform/` 目录下定义服务接口和标识符。

**关键点**：
- 接口定义服务的能力
- 使用 Symbol 创建服务标识符
- 导出接口和标识符

#### 5.3.2 第二步：实现服务（Services 层）

在 `services/` 目录下实现服务。

**关键点**：
- 使用 `@injectable()` 装饰器声明依赖
- 实现接口定义的所有方法
- 如果有资源需要清理，继承 Disposable

#### 5.3.3 第三步：注册服务（入口文件）

在应用入口（如 `App.tsx`）注册服务到 DI 容器。

**注册顺序很重要**：
- 被依赖的服务要先注册
- 依赖其他服务的要后注册
- 通常顺序：Base Services → Platform Services → Business Services

#### 5.3.4 第四步：使用服务

**在 Services 层**：通过构造函数注入

**在 Workbench 层（React）**：通过 `useService` Hook

### 5.4 依赖关系图

```
┌─────────────────────────────────────────────────────────────┐
│                     DI 容器                                  │
│  (InstantiationService)                                     │
│                                                              │
│  ┌──────────────────────────────────────────────┐           │
│  │  ServiceCollection                            │           │
│  │  ┌────────────────────────────────────────┐  │           │
│  │  │  IEditorServiceId → EditorServiceProxy │  │           │
│  │  │  IChatServiceId → ChatService          │  │           │
│  │  │  IAgentServiceId → AgentService        │  │           │
│  │  │  ILLMServiceId → LLMService            │  │           │
│  │  │  ...                                    │  │           │
│  │  └────────────────────────────────────────┘  │           │
│  └──────────────────────────────────────────────┘           │
│                                                              │
│  getService(IChatServiceId) ────┐                           │
│                                  │                           │
│                    ┌─────────────▼────────────┐             │
│                    │  检查是否已实例化         │             │
│                    └─────────────┬────────────┘             │
│                                  │                           │
│                        是 ◄──────┴──────► 否                │
│                        │                   │                 │
│                 返回实例              解析依赖                │
│                                       │                       │
│                              ┌────────▼───────┐              │
│                              │ 递归实例化依赖  │              │
│                              └────────┬───────┘              │
│                                       │                       │
│                              ┌────────▼───────┐              │
│                              │ 调用构造函数    │              │
│                              └────────┬───────┘              │
│                                       │                       │
│                              ┌────────▼───────┐              │
│                              │ 缓存实例        │              │
│                              └────────┬───────┘              │
│                                       │                       │
│                                  返回实例                      │
└─────────────────────────────────────────────────────────────┘
```

### 5.5 最佳实践

#### 5.5.1 服务应该是单例

- 每个服务在 DI 容器中只有一个实例
- 不要在服务中保存特定于某次请求的状态
- 如果需要多实例，考虑使用工厂模式

#### 5.5.2 避免循环依赖

- A 依赖 B，B 依赖 A 会导致无法实例化
- 如果必须双向通信，使用事件机制
- 重新审视职责划分，可能需要拆分服务

#### 5.5.3 接口隔离原则

- 一个服务接口应该只包含相关的方法
- 如果接口太大，考虑拆分为多个小接口
- 客户端不应该依赖它不使用的方法

#### 5.5.4 依赖倒置原则

- 高层模块不应该依赖低层模块，两者都应该依赖抽象
- Services 层依赖 Platform 层的接口，而不是具体实现
- Workbench 层依赖 Platform 层的接口，而不是 Services 层

---

## 6. RPC 通信系统

### 6.1 为什么需要 RPC？

**浏览器插件的隔离性**：

Chrome 插件的不同部分运行在不同的环境中：
- **Sidepanel/Popup**：独立的页面环境，无法直接访问 Overleaf 页面的 DOM
- **Content Script**：可以访问页面 DOM，但运行在隔离环境中
- **Injected Script**：运行在页面主世界，可以访问 `window.overleaf` 等内部 API

**问题**：
- Sidepanel 的 UI 需要获取编辑器内容
- 但 Sidepanel 无法直接访问编辑器 DOM
- 必须通过消息传递与 Content Script 通信

**解决方案**：RPC（Remote Procedure Call）系统
- Sidepanel 通过 RPC 调用 Content Script 的方法
- 对上层透明，就像调用本地方法一样

### 6.2 RPC 架构概览

```
┌──────────────────────────────────────────────────────────────┐
│  Sidepanel (React App)                                       │
│  ┌───────────────────────────────────────────────────┐       │
│  │  Workbench 层                                      │       │
│  │  const editor = useService(IEditorServiceId);     │       │
│  │  const text = await editor.getEditorFullText();   │       │
│  └───────────────────┬───────────────────────────────┘       │
│                      │ 调用                                   │
│  ┌───────────────────▼───────────────────────────────┐       │
│  │  EditorServiceProxy (RPC Client)                  │       │
│  │  - 实现 IEditorService 接口                        │       │
│  │  - 内部通过 RPCClient 发送请求                     │       │
│  └───────────────────┬───────────────────────────────┘       │
│                      │                                        │
│  ┌───────────────────▼───────────────────────────────┐       │
│  │  RPCClient                                        │       │
│  │  - call(method, ...args)                          │       │
│  │  - 生成请求 ID                                     │       │
│  │  - 等待响应                                        │       │
│  └───────────────────┬───────────────────────────────┘       │
└────────────────────┬─┴───────────────────────────────────────┘
                     │
                     │ chrome.runtime.sendMessage
                     │
┌────────────────────▼─────────────────────────────────────────┐
│  Content Script (Overleaf 页面)                              │
│  ┌───────────────────────────────────────────────────┐       │
│  │  RPCServer                                        │       │
│  │  - 监听消息                                        │       │
│  │  - 查找注册的方法                                  │       │
│  │  - 调用方法并返回结果                              │       │
│  └───────────────────┬───────────────────────────────┘       │
│                      │ 调用                                   │
│  ┌───────────────────▼───────────────────────────────┐       │
│  │  OverleafEditorService (真实实现)                  │       │
│  │  - 实现 IEditorService 接口                        │       │
│  │  - 直接操作 DOM                                    │       │
│  │  - 通过 overleafBridge 访问编辑器 API              │       │
│  └───────────────────┬───────────────────────────────┘       │
│                      │ 调用                                   │
│  ┌───────────────────▼───────────────────────────────┐       │
│  │  overleafBridge.js (Injected Script)              │       │
│  │  - 运行在页面主世界                                │       │
│  │  - 访问 window.overleaf                            │       │
│  │  - 操作 EditorView                                 │       │
│  └───────────────────────────────────────────────────┘       │
└──────────────────────────────────────────────────────────────┘
```

### 6.3 RPC 核心组件

#### 6.3.1 IRPCChannel（RPC 通道抽象）

定义了消息传递的接口：

**职责**：
- 发送消息到另一端
- 监听来自另一端的消息
- 支持不同的通道实现（chrome.runtime、postMessage 等）

**实现类型**：
- **ChromeRuntimeChannel**：通过 `chrome.runtime.sendMessage` 通信（Sidepanel ↔ Content Script）
- **WindowMessageChannel**：通过 `window.postMessage` 通信（Content Script ↔ Injected Script）

#### 6.3.2 RPCClient（RPC 客户端）

用于发起 RPC 调用：

**核心方法**：
- `call<T>(method: string, ...args: any[]): Promise<T>`

**工作流程**：
1. 生成唯一的请求 ID（UUID）
2. 将方法名和参数序列化为消息
3. 通过 IRPCChannel 发送消息
4. 创建 Promise 并等待响应
5. 收到响应后 resolve Promise

**特性**：
- 支持异步调用
- 自动超时处理
- 错误传播

#### 6.3.3 RPCServer（RPC 服务端）

用于接收和处理 RPC 请求：

**核心方法**：
- `registerMethod(name: string, handler: Function)`

**工作流程**：
1. 监听来自 IRPCChannel 的消息
2. 解析请求（方法名、参数、请求 ID）
3. 查找注册的方法处理器
4. 调用处理器并获取结果
5. 将结果序列化并发送回客户端

**特性**：
- 支持同步和异步方法
- 自动捕获异常并返回错误
- 支持方法重载

#### 6.3.4 ServiceProxy（服务代理）

实现服务接口但内部通过 RPC 调用：

**作用**：
- 在 Sidepanel 端实现 IEditorService 接口
- 内部所有方法都通过 RPCClient 转发到 Content Script
- 对上层透明，调用方式与真实服务完全相同

**命名规范**：`XxxServiceProxy`

**典型实现**：
- `EditorServiceProxy`：编辑器服务代理
- `StorageServiceProxy`：存储服务代理

### 6.4 RPC 消息格式

#### 6.4.1 请求消息

```
{
  type: 'rpc_request',
  id: 'uuid-1234-5678',     // 请求唯一标识
  method: 'getEditorFullText', // 方法名
  args: []                   // 参数数组
}
```

#### 6.4.2 响应消息

成功响应：
```
{
  type: 'rpc_response',
  id: 'uuid-1234-5678',     // 对应请求的 ID
  success: true,
  result: '文件内容...'      // 返回值
}
```

错误响应：
```
{
  type: 'rpc_response',
  id: 'uuid-1234-5678',
  success: false,
  error: 'Error message'    // 错误信息
}
```

### 6.5 RPC 调用示例

#### 6.5.1 Sidepanel 端（客户端）

Workbench 层通过 useService 获取代理服务，调用方式与本地服务完全相同。

#### 6.5.2 Content Script 端（服务端）

在 Content Script 中注册真实服务的方法到 RPC Server。

### 6.6 RPC 最佳实践

#### 6.6.1 方法应该是纯函数

- RPC 方法不应该依赖服务端的状态
- 所有需要的信息都通过参数传递
- 返回值应该是可序列化的

#### 6.6.2 避免频繁调用

- RPC 有通信开销，避免在循环中调用
- 批量操作优于单个操作
- 考虑缓存频繁访问的数据

#### 6.6.3 处理超时和错误

- 设置合理的超时时间
- 优雅处理网络错误
- 向用户展示友好的错误信息

#### 6.6.4 类型安全

- 使用 TypeScript 定义接口
- 客户端和服务端共享接口定义
- 避免类型不匹配导致的错误

---

## 7. 编辑器桥接系统

### 7.1 为什么需要桥接系统？

**Overleaf 编辑器的特殊性**：

Overleaf 使用 CodeMirror 6 作为编辑器，并在 `window.overleaf` 对象上暴露了一些内部 API：

- `window.overleaf.unstable.store`：Overleaf 的状态存储
- `window.overleaf.unstable.store.get('editor.view')`：获取 EditorView 实例

**问题**：
- Content Script 运行在隔离环境，无法访问页面的 `window` 对象
- 无法直接获取 EditorView，也就无法读取/修改编辑器内容
- 无法直接调用 Overleaf 的内部 API

**解决方案**：桥接系统
1. 将 `overleafBridge.js` 注入到页面主世界
2. overleafBridge 访问 `window.overleaf` 和 EditorView
3. Content Script 通过 `window.postMessage` 与 overleafBridge 通信
4. 上层通过 RPC 与 Content Script 通信

### 7.2 桥接架构概览

```
┌────────────────────────────────────────────────────────────┐
│  Sidepanel                                                 │
│  ┌──────────────────────────────────────────────┐         │
│  │  EditorServiceProxy (RPC Client)             │         │
│  └────────────┬─────────────────────────────────┘         │
└───────────────┼─────────────────────────────────────────────┘
                │ chrome.runtime.sendMessage
                │
┌───────────────▼─────────────────────────────────────────────┐
│  Content Script (隔离环境)                                  │
│  ┌──────────────────────────────────────────────┐         │
│  │  OverleafEditorService                       │         │
│  │  - RPC Server 注册的服务                     │         │
│  │  - 通过 bridge 与 Injected Script 通信       │         │
│  └────────────┬─────────────────────────────────┘         │
│               │                                            │
│  ┌────────────▼─────────────────────────────────┐         │
│  │  OverleafBridgeClient                        │         │
│  │  - call(method, ...args)                     │         │
│  │  - 通过 window.postMessage 发送请求          │         │
│  └────────────┬─────────────────────────────────┘         │
└───────────────┼─────────────────────────────────────────────┘
                │ window.postMessage
                │
┌───────────────▼─────────────────────────────────────────────┐
│  Injected Script (页面主世界)                                │
│  ┌──────────────────────────────────────────────┐         │
│  │  overleafBridge.js                           │         │
│  │  - 监听 window message                        │         │
│  │  - 访问 window.overleaf                       │         │
│  │  - 操作 EditorView                            │         │
│  │  - 返回结果                                   │         │
│  └──────────────────────────────────────────────┘         │
└────────────────────────────────────────────────────────────┘
```

### 7.3 核心组件详解

#### 7.3.1 overleafBridge.js（注入脚本）

**位置**：
- **源码**: `public/injected/modules/` (模块化源码)
- **构建输出**: `dist/injected/overleafBridge.js` (单文件版本)

**加载方式**：
- 在 manifest.json 中声明 `web_accessible_resources`
- Content Script 通过创建 `<script>` 标签注入到页面
- 浏览器加载构建后的单文件版本

**核心职责**：

**1. EditorView 访问**
- 通过 `window.overleaf.unstable.store.get('editor.view')` 获取 EditorView
- 提供统一的 EditorView 获取接口

**2. 文档操作**
- 获取文档内容：`getDocText()`
- 获取文档行数：`getDocLines()`
- 获取选区信息：`getSelectionInfo()`
- 读取指定行：`getLineContent(lineNumber)`
- 读取行范围：`readLines(startLine, endLine)`

**3. 编辑操作**
- 插入文本：`insertText(text)`
- 替换范围：`replaceRange(from, to, text)`
- 替换首个匹配：`replaceFirstMatch(searchText, replaceText)`
- 应用多个编辑：`applyEdits(edits)`
- 设置全文：`setDocContent(newContent)`

**4. 文件操作**
- 获取当前文件：`getCurrentFile()`
- 切换文件：`switchFile(targetFilename)`
- 获取文件信息：`getFileInfo()`

**5. 项目搜索**
- 全项目搜索：`searchProject(pattern, options)`
- 获取项目文件统计：`getProjectFileStats()`

**6. 文本操作预览**
- 显示预览：`showTextActionPreview(previewData)`
- 流式预览：`startStreamPreview()` / `updateStreamPreview()` / `completeStreamPreview()`
- 处理决策：`handlePreviewDecision(accepted)`

**7. 选区工具提示**
- 显示选区操作菜单（扩写、缩写、润色、翻译等）
- 快捷键支持（Ctrl+Alt+/）
- 模型选择器

**消息协议**：

请求格式：
```
{
  type: 'OVERLEAF_BRIDGE_REQUEST',
  requestId: 'uuid-1234',
  method: 'getDocText',
  args: []
}
```

响应格式：
```
{
  type: 'OVERLEAF_BRIDGE_RESPONSE',
  requestId: 'uuid-1234',
  success: true,
  result: '文档内容...'
}
```

#### 7.3.2 OverleafBridgeClient（桥接客户端）

**位置**：`services/editor/bridge/OverleafBridgeClient.ts`

**职责**：
- 在 Content Script 中运行
- 封装与 overleafBridge.js 的通信
- 提供 Promise 风格的 API

**核心方法**：
- `call<T>(method: string, ...args: any[]): Promise<T>`

**工作原理**：
1. 生成唯一请求 ID
2. 通过 `window.postMessage` 发送请求
3. 监听响应消息
4. 根据请求 ID 匹配响应
5. resolve 或 reject Promise

#### 7.3.3 编辑器模块系统

**位置**：`services/editor/modules/`

为了更好地组织代码，编辑器服务被拆分为多个功能模块：

**BaseModule（模块基类）**
- 所有模块的基类
- 提供 `call()` 便捷方法访问 bridge

**DocumentModule（文档模块）**
- 文档内容读取
- 文档信息获取
- 方法：getDocText, getDocLines, readLines 等

**EditorModule（编辑器模块）**
- 编辑器状态
- 选区操作
- 方法：getSelectionInfo, getCursorPosition 等

**FileModule（文件模块）**
- 文件管理
- 文件切换
- 方法：getCurrentFile, switchFile 等

**ProjectModule（项目模块）**
- 项目搜索
- 项目统计
- 方法：searchProject, getProjectFileStats 等

**SelectionModule（选区模块）**
- 选区操作
- 文本插入
- 方法：insertTextAtCursor, replaceSelection 等

**模块组织的优势**：
- 职责清晰
- 易于维护
- 支持按需加载
- 方便测试

#### 7.3.4 overleafBridge.js 模块化重构

**重构背景**：

原始的 `overleafBridge.js` 文件包含约 **4986 行代码**，包含了所有功能的实现，导致：
- 文件过大，难以维护
- 职责不清晰，难以定位代码
- 多人协作容易产生冲突
- 难以进行单元测试

**重构目标**：

将单一巨型文件拆分为清晰的模块化结构，同时保持：
- ✅ 所有接口 100% 向后兼容
- ✅ 功能行为完全一致
- ✅ 构建输出为单文件（兼容现有加载机制）

**模块化结构**：

```
public/injected/
├── overleafBridge.js.backup   # 原始文件备份（4986行）
└── modules/                    # 模块化源码（已完成重构）✅
    ├── main.js                # 主入口文件（342行）
    ├── legacy.js              # 大型UI模块（4123行）
    ├── core/                  # 核心功能模块
    │   ├── editorView.js     # EditorView 访问封装
    │   └── utils.js          # 通用工具函数
    ├── search/                # 搜索功能模块
    │   ├── projectId.js      # 项目 ID 获取
    │   ├── fetchers.js       # 文件获取（entities, hash, blob）
    │   ├── searchEngine.js   # 搜索引擎（正则、匹配）
    │   └── index.js          # 统一导出
    ├── methodHandlers/        # API 方法处理器
    │   ├── document.js       # 文档读取方法
    │   ├── editor.js         # 编辑器操作方法
    │   ├── file.js           # 文件管理方法
    │   ├── project.js        # 项目级方法
    │   └── index.js          # 组合所有处理器
    ├── selectionTooltip/      # 选区工具提示
    │   ├── activation.js     # 激活状态管理
    │   ├── modelSelector.js  # 模型选择器
    │   └── index.js          # 统一导出
    ├── preview/               # 预览系统（占位符）
    │   └── index.js          
    ├── diff/                  # Diff 建议系统（占位符）
    │   └── index.js          
    └── modelManagement/       # 模型管理
        └── modelList.js      # 模型列表同步

scripts/
├── build-bridge-new.js        # 新构建脚本（使用中）
├── build-bridge.js            # 旧构建脚本（备用）
└── extract-legacy.js          # Legacy 提取脚本

dist/injected/
└── overleafBridge.js          # 构建输出（4491行，自动生成）
```

**重构完成状态**：✅ 原始单体文件已删除，完全使用模块化源码

**已重构模块详解**：

**1. 核心模块 (core/)**

**editorView.js**
- `getEditorView()`: 统一的 EditorView 获取接口
- 访问 `window.overleaf.unstable.store`
- 错误处理和日志记录

**utils.js**
- `escapeHtml()`: HTML 字符转义
- `generatePreviewId()`: 生成唯一 ID
- `getCurrentFileName()`: 获取当前文件名
- 通用工具函数集合

**2. 搜索模块 (search/)**

**projectId.js**
- `getProjectId()`: 从 URL 或 meta 标签获取项目 ID
- 统一的项目标识获取逻辑

**fetchers.js** (~400 行)
- `fetchEntities()`: 获取项目文件列表
- `fetchFileHashes()`: 获取文件 hash 映射
- `fetchBlobContent()`: 通过 blob API 获取文件内容
- `getAllDocsWithContent()`: 批量获取所有文档内容
- 优先使用当前编辑器的实时内容

**searchEngine.js**
- `createSearchRegex()`: 创建搜索正则表达式
- `searchInFile()`: 在单个文件中搜索
- `searchInternal()`: 主搜索函数
- 支持大小写敏感、全字匹配、正则搜索

**3. 方法处理器 (methodHandlers/)** (~500 行)

将原 `methodHandlers` 对象拆分为 4 个专注的模块：

**document.js** (15 个方法)
- `getDocText()`, `getDocLines()`: 获取文档内容
- `getSelection()`, `getSelectionInfo()`: 选区信息
- `getCursorPosition()`, `getPositionAtOffset()`: 位置信息
- `getLineContent()`, `getLineRange()`: 行操作
- `readLines()`, `readEntireFile()`: 文件读取

**editor.js** (5 个方法)
- `insertText()`: 插入文本
- `replaceRange()`: 替换范围
- `replaceFirstMatch()`: 智能替换（防止多处匹配）
- `setDocContent()`: 设置全文
- `applyEdits()`: 批量应用编辑

**file.js** (3 个方法)
- `getCurrentFile()`: 获取当前文件（支持多种策略）
- `switchFile()`: 切换文件
- `getFileInfo()`: 获取文件元信息

**project.js** (2 个方法)
- `searchProject()`: 全项目搜索
- `getProjectFileStats()`: 项目文件统计

**4. 模型管理 (modelManagement/)**

**modelList.js** (~100 行)
- `getAvailableModels()`: 获取可用模型列表
- `requestModelList()`: 请求模型列表
- `setupModelListListener()`: 监听模型更新
- `initializeModelManagement()`: 初始化
- 与 React 应用的模型列表同步

**5. 选区工具提示 (selectionTooltip/)**

**activation.js**
- `checkIsActivated()`: 检查激活状态
- `showActivationRequiredHint()`: 显示激活提示
- `requestActivationStatus()`: 请求激活状态
- `setupActivationListener()`: 监听激活更新
- 与 React 应用的激活状态同步

**modelSelector.js**
- `getSelectedTextActionModel()`: 获取选中的模型
- `setSelectedTextActionModel()`: 保存模型选择
- `createModelSelector()`: 创建模型选择器 UI
- `updateModelSelectorOptions()`: 更新选项
- localStorage 持久化

**构建系统**：

**位置**：`scripts/build-bridge-new.js`

**功能**：
- 读取 `public/injected/modules/main.js` (主入口 + 核心功能)
- 读取 `public/injected/modules/legacy.js` (大型 UI 模块)
- 智能合并所有模块为单文件
- 添加构建信息注释
- 输出到 `dist/injected/overleafBridge.js`

**运行**：
```bash
npm run build:bridge
```

**构建输出示例**：
```
🔨 开始构建 overleafBridge.js (模块化版本)...
✅ Main: 9512 字符
✅ Legacy: 126930 字符
✅ 写入完成: 136812 字符
✨ 构建完成！

📊 模块统计:
   - Main 入口: 342 行
   - Legacy UI: 4132 行
   - 总计: 4491 行
```

**构建流程**：
```
源码结构:
  modules/main.js (核心功能 + 搜索引擎)
  modules/legacy.js (选区提示、预览、Diff UI)
         ↓
  build-bridge-new.js (智能合并)
         ↓
  dist/injected/overleafBridge.js (单文件输出)
         ↓
  浏览器加载使用
```

**开发工作流**：
```bash
# 1. 修改模块化源码
vim public/injected/modules/main.js
vim public/injected/modules/legacy.js

# 2. 构建
npm run build:bridge

# 3. 测试
# 重新加载浏览器扩展，验证功能
```

**备份和回滚**：
```bash
# 原始文件已备份
public/injected/overleafBridge.js.backup

# 如需回滚到原始版本
npm run build:bridge:old  # 使用备份构建
```

**模块架构说明**：

**main.js (342 行)** - 主入口文件
- ✅ EditorView 访问
- ✅ 工具函数 (escapeHtml, generatePreviewId, getCurrentFileName)
- ✅ 搜索引擎完整实现
  - getProjectId(), fetchEntities(), fetchFileHashes()
  - fetchBlobContent(), getAllDocsWithContent()
  - createSearchRegex(), searchInFile(), searchInternal()

**legacy.js (4123 行)** - 大型 UI 模块
- ✅ methodHandlers 对象（所有 API 方法）
- ✅ 消息监听器
- ✅ 选区工具提示完整 UI
- ✅ 预览系统完整实现
- ✅ Diff 建议系统完整实现
- ✅ 模型管理和激活状态

**为什么保留 legacy.js？**
- 包含复杂的 UI 逻辑（~4000 行）
- 作为整体模块保留，保证功能稳定
- 未来可渐进式地进一步拆分为：
  - preview/overlay.js, preview/stream.js
  - diff/api.js, diff/ui.js, diff/suggestions.js
  - selectionTooltip/ui.js, selectionTooltip/events.js

**重构成果**：

| 指标 | 数值 | 状态 |
|------|------|------|
| 原文件状态 | 已删除 | ✅ |
| 备份文件 | overleafBridge.js.backup | ✅ |
| 模块化源码行数 | 4465 行 | ✅ |
| 构建输出行数 | 4491 行 | ✅ |
| 创建的模块文件 | 20+ 个 | ✅ |
| 功能模块数 | 7 个 | ✅ |
| 接口兼容性 | 100% | ✅ |
| 构建状态 | 正常 | ✅ |

**依赖关系**：
```
已安装依赖:
- esbuild (打包工具)

npm 脚本:
- build:bridge: 从模块化源码构建（新）
- build:bridge:old: 从备份构建（备用）
```

**重构优势**：

1. **可维护性提升**
   - 每个文件专注单一职责（100-500 行）
   - 易于定位和修改代码
   - 减少修改影响范围

2. **可读性提升**
   - 清晰的模块划分和命名
   - 详细的注释和文档
   - 代码结构一目了然

3. **可扩展性提升**
   - 新功能可独立添加为新模块
   - 模块间低耦合
   - 支持渐进式迁移

4. **团队协作友好**
   - 多人可并行开发不同模块
   - 减少代码冲突
   - 清晰的责任边界

**开发工作流**：

```bash
# 1. 修改核心功能或搜索引擎
vim public/injected/modules/main.js

# 2. 修改 UI 功能（工具提示、预览、Diff）
vim public/injected/modules/legacy.js

# 3. 修改独立小模块
vim public/injected/modules/core/editorView.js
vim public/injected/modules/search/fetchers.js
vim public/injected/modules/methodHandlers/document.js

# 4. 构建
npm run build:bridge

# 5. 测试
# 重新加载浏览器扩展，验证所有功能正常
```

**重构优势**：

1. **可维护性提升 ⬆️**
   - 代码按功能清晰分类（20+ 个文件）
   - 快速定位需要修改的部分
   - 多人协作减少冲突

2. **可扩展性提升 ⬆️**
   - 新功能可独立添加为新模块
   - 模块间低耦合，依赖清晰
   - 支持渐进式迁移（legacy → 细粒度模块）

3. **开发效率提升 ⚡**
   - 自动化构建（npm run build:bridge）
   - 修改小文件，IDE 性能更好
   - 备份文件随时可恢复

4. **代码质量提升 📈**
   - 职责分离明确
   - 便于单元测试
   - 便于代码审查

**接口保证**：

- ✅ 所有 `methodHandlers` 的 25+ 个方法保持不变
- ✅ 消息协议 (OVERLEAF_BRIDGE_REQUEST/RESPONSE) 完全兼容
- ✅ 全局 API (window.diffAPI) 保持不变
- ✅ 所有功能行为一致
- ✅ 构建输出行数接近原文件（4491 vs 4986）

**安全措施**：

- ✅ 原始文件已备份为 `overleafBridge.js.backup`
- ✅ 可随时通过 `npm run build:bridge:old` 使用备份版本
- ✅ 构建过程记录详细日志
- ✅ 模块化源码在 Git 中完整保留

**后续改进方向**：

1. **短期（1-2周）**
   - 从 legacy.js 提取 methodHandlers 到独立模块
   - 优化构建脚本，添加代码压缩
   - 添加构建验证和测试

2. **中期（1个月）**
   - 从 legacy.js 提取预览系统到 preview/ 模块
   - 从 legacy.js 提取 Diff 系统到 diff/ 模块
   - 从 legacy.js 提取工具提示 UI 到 selectionTooltip/ 模块
   - 使用 esbuild 高级功能（tree-shaking、压缩）

3. **长期（持续）**
   - 将所有模块转换为 TypeScript
   - 添加单元测试和集成测试
   - 完全消除 legacy.js，所有代码模块化

### 7.4 搜索功能详解

overleafBridge.js 实现了强大的项目级搜索功能：

**搜索流程**：

1. **获取项目文件列表**
   - 通过 `/project/{id}/entities` API 获取所有实体
   - 过滤出可编辑文档（type === 'doc'）

2. **获取文件内容**
   - 优先使用当前编辑器的实时内容（通过 EditorView）
   - 其他文件通过 `/project/{id}/latest/history` 获取 hash
   - 再通过 `/project/{id}/blob/{hash}` 获取内容

3. **执行搜索**
   - 支持普通文本搜索
   - 支持正则表达式搜索
   - 支持大小写敏感/不敏感
   - 支持全字匹配

4. **返回结果**
   - 文件路径
   - 匹配位置（行号、列号）
   - 匹配文本
   - 上下文行

**性能优化**：
- 批量获取文件内容（每批 5 个）
- 当前编辑器文件使用实时内容，无需额外请求
- 搜索结果包含统计信息

### 7.5 文本操作预览系统

**设计目标**：
- 用户执行文本操作（扩写、缩写、润色等）前先预览结果
- 显示删除线原文和新文本对比
- 用户确认后才真正修改

**预览流程**：

1. **触发操作**
   - 用户选中文本
   - 点击操作按钮（如"润色"）

2. **AI 生成**
   - 调用 LLM 生成新文本
   - 支持流式输出（逐字显示）

3. **显示预览**
   - overleafBridge 显示预览覆盖层
   - 原文显示为删除线
   - 新文本以高亮显示
   - 支持拖拽移动预览窗口

4. **用户决策**
   - 用户点击"接受"或"拒绝"
   - 接受：用新文本替换原文
   - 拒绝：保持原文不变

**流式预览**：
- AI 生成过程中实时更新预览
- 显示光标动画表示正在生成
- 生成完成后显示确认按钮
- 用户可随时按 ESC 取消

**预览界面特性**：
- 现代化设计（毛玻璃效果、渐变背景）
- 可拖拽移动
- 自适应位置（避免超出视口）
- 支持键盘快捷键（ESC 关闭）

### 7.6 选区工具提示

**功能**：
- 用户选中文本后，自动显示操作菜单
- 提供快捷操作按钮：扩写、缩写、润色、翻译
- 支持自定义输入（用户自定义要求）
- 支持快捷键唤起（Ctrl+Alt+/）

**工作原理**：

1. **选区检测**
   - 监听 mouseup 事件
   - 检测是否有选中文本
   - 计算选区位置

2. **显示菜单**
   - 在选区附近显示悬浮菜单
   - 包含操作按钮和自定义输入框
   - 显示模型选择器

3. **处理操作**
   - 用户点击按钮或输入自定义要求
   - 发送消息到 Content Script
   - Content Script 调用 TextActionService
   - 执行 AI 操作并显示预览

4. **自动隐藏**
   - 用户点击其他地方
   - 用户开始输入
   - 用户按 ESC 键

**快捷键模式**：
- 按 Ctrl+Alt+/ 唤起菜单
- 无需选中文本（在光标处操作）
- 支持插入模式（AI 生成新内容）

### 7.7 桥接系统最佳实践

#### 7.7.1 方法命名规范

- 使用动词开头：get, set, read, write, insert, replace
- 清晰表达意图：getDocText, replaceRange
- 避免缩写：使用 document 而非 doc

#### 7.7.2 参数设计

- 使用对象参数传递多个选项
- 提供合理的默认值
- 参数应该是可序列化的（不能传递函数）

#### 7.7.3 错误处理

- 所有方法都应该捕获异常
- 返回统一的错误格式
- 错误信息应该清晰描述问题

#### 7.7.4 性能优化

- 批量操作优于单个操作
- 缓存不常变化的数据
- 避免频繁的 DOM 查询

---

## 8. 存储系统

### 8.1 存储需求

浏览器插件需要存储：
- **用户配置**：API Key、模型选择、偏好设置
- **对话历史**：聊天记录、会话列表
- **激活状态**：插件激活码、激活状态
- **临时数据**：当前会话、选中的上下文文件

### 8.2 存储类型

#### 8.2.1 chrome.storage.local

**特点**：
- 本地持久化存储
- 容量限制：约 10MB
- 不同步到其他设备
- 卸载插件后数据保留

**适用场景**：
- API Key、激活码等敏感信息
- 大量对话历史
- 临时缓存

#### 8.2.2 chrome.storage.sync

**特点**：
- 自动同步到用户的所有设备
- 容量限制：约 100KB
- 需要用户登录 Chrome

**适用场景**：
- 用户偏好设置
- 模型选择
- UI 配置

### 8.3 存储服务架构

```
┌────────────────────────────────────────────────────────────┐
│  Sidepanel                                                 │
│  ┌──────────────────────────────────────────────┐         │
│  │  useStorage() Hook                           │         │
│  │  - get(key)                                  │         │
│  │  - set(key, value)                           │         │
│  └────────────┬─────────────────────────────────┘         │
│               │                                            │
│  ┌────────────▼─────────────────────────────────┐         │
│  │  StorageServiceProxy (RPC Client)            │         │
│  └────────────┬─────────────────────────────────┘         │
└───────────────┼─────────────────────────────────────────────┘
                │ chrome.runtime.sendMessage
                │
┌───────────────▼─────────────────────────────────────────────┐
│  Content Script / Background                               │
│  ┌──────────────────────────────────────────────┐         │
│  │  StorageService (真实实现)                   │         │
│  │  - 调用 chrome.storage API                   │         │
│  │  - 数据序列化/反序列化                        │         │
│  │  - 事件通知                                  │         │
│  └──────────────────────────────────────────────┘         │
└────────────────────────────────────────────────────────────┘
```

### 8.4 IStorageService 接口

**定义位置**：`platform/storage/storage.ts`

**核心方法**：
- `get<T>(key: string): Promise<T | null>`：读取数据
- `set<T>(key: string, value: T): Promise<void>`：写入数据
- `remove(key: string): Promise<void>`：删除数据
- `clear(): Promise<void>`：清空所有数据

**事件**：
- `onDidChange: Event<StorageChangeEvent>`：存储变化事件

### 8.5 存储键命名规范

**格式**：`category.subcategory.key`

**示例**：
- `user.apiKey`：用户 API Key
- `user.modelSelection`：选中的模型
- `activation.code`：激活码
- `activation.status`：激活状态
- `conversation.current`：当前会话 ID
- `conversation.history`：会话历史
- `ui.sidebarWidth`：侧边栏宽度
- `ui.theme`：主题设置

### 8.6 数据序列化

**存储格式**：
- 简单类型直接存储（string, number, boolean）
- 复杂对象使用 JSON.stringify 序列化
- 读取时自动反序列化

**注意事项**：
- 不能存储函数
- 不能存储循环引用的对象
- Date 对象会被转换为字符串

### 8.7 存储最佳实践

#### 8.7.1 避免频繁写入

- 批量更新而非逐个更新
- 使用防抖（debounce）延迟写入
- 只在必要时才写入

#### 8.7.2 数据版本管理

- 在数据中包含版本号
- 读取时检查版本号
- 支持迁移旧版本数据

#### 8.7.3 敏感信息保护

- API Key 等敏感信息应该加密存储
- 不要在日志中打印敏感信息
- 提供清除数据的功能

#### 8.7.4 容量管理

- 定期清理过期数据
- 对大量历史记录进行分页
- 超过限制时提示用户

---

## 第三部分：业务系统

---

## 9. Agent 与对话系统

### 9.1 系统架构

Agent 系统是整个插件的核心，负责 AI 对话、工具调用、上下文管理等功能。

#### 9.1.1 服务分层

```
┌─────────────────────────────────────────────────────────────┐
│                       Workbench (UI)                         │
│  ConversationPane.tsx - 对话界面                             │
└───────────────────────────┬─────────────────────────────────┘
                            │ 只依赖 IChatService
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    ChatService (会话管理)                     │
│  职责：                                                      │
│  - 管理对话消息列表                                          │
│  - 分发事件到 UI                                            │
│  - 协调 AgentService                                        │
└───────────────────────────┬─────────────────────────────────┘
                            │ 依赖 IAgentService
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                 AgentService (Agent Loop 核心)               │
│  职责：                                                      │
│  - Agent Loop 循环控制                                      │
│  - 工具调用决策（自动 vs 审批）                              │
│  - 工具审批状态管理                                          │
│  - 防止死循环                                               │
└──────────┬──────────────────────────┬───────────────────────┘
           │                          │
           │ 依赖                     │ 依赖
           ▼                          ▼
┌──────────────────────┐    ┌──────────────────────┐
│  PromptService       │    │  ToolService         │
│  提示词构建           │    │  工具注册与执行       │
└──────────┬───────────┘    └──────────────────────┘
           │ 依赖
           ▼
┌──────────────────────────────────────────────────┐
│            LLMService (LLM 调用)                  │
│  依赖：ILLMProviderService (厂商适配)              │
└──────────────────────────────────────────────────┘
```

### 9.2 核心服务详解

#### 9.2.1 ChatService（会话管理）

**位置**：`services/agent/ChatService.ts`

**职责**：
- 管理对话消息列表
- 对外提供统一的对话接口
- 事件分发到 UI
- 持久化会话历史

**核心状态**：
- `_messages: ChatMessage[]`：当前会话的消息列表
- `_isProcessing: boolean`：是否正在处理请求
- `_currentConversationId: string`：当前会话 ID

**核心方法**：

**sendMessage(input, options)**
- 参数：
  - `input: string`：用户输入
  - `options: ChatOptions`：配置选项
    - `mode: 'agent' | 'chat' | 'normal'`：对话模式
    - `modelId: string`：选择的模型
    - `contextItems: ContextItem[]`：上下文文件/片段
    - `conversationId?: string`：会话 ID
- 流程：
  1. 将用户消息添加到 `_messages`
  2. 触发 `onDidMessageUpdate` 事件
  3. 调用 `AgentService.startLoop()`
  4. 监听 AgentService 事件并更新 UI

**abort()**
- 中断当前正在进行的对话
- 调用 `AgentService.abortLoop()`

**核心事件**：
- `onDidMessageUpdate: Event<ChatMessage[]>`：消息列表更新
- `onDidToolCallPending: Event<ToolCallPendingEvent>`：需要用户审批工具调用

**为什么需要 ChatService？**
- UI 不应该直接操作 AgentService（职责分离）
- ChatService 提供会话级别的抽象
- 统一管理消息历史和事件

#### 9.2.2 AgentService（Agent Loop 核心）

**位置**：`services/agent/AgentService.ts`

**职责**：
- Agent Loop 循环控制
- 工具调用决策
- 工具审批管理
- 防止死循环

**核心概念：Agent Loop**

Agent Loop 是 AI Agent 的核心工作模式：

```
1. 用户提问
   ↓
2. 构建提示词（包含历史、上下文、工具定义）
   ↓
3. 调用 LLM
   ↓
4. 解析 LLM 响应
   ↓
5. 是否有工具调用？
   ├─ 否 → 返回最终答案（结束）
   └─ 是 → 继续
       ↓
   6. 工具是否需要审批？
      ├─ 否 → 直接执行工具
      └─ 是 → 等待用户审批
          ↓
   7. 执行工具，获取结果
      ↓
   8. 将工具结果添加到对话历史
      ↓
   9. 回到步骤 2（继续下一轮）
```

**核心方法**：

**startLoop(initialMessages, options)**
- 参数：
  - `initialMessages: ChatMessage[]`：初始消息（包含历史）
  - `options: AgentOptions`：
    - `mode: 'agent' | 'chat' | 'normal'`
    - `modelId: string`
    - `maxIterations: number`：最大循环次数（防止死循环）
    - `contextItems: ContextItem[]`
- 返回：`AgentLoopController`（用于控制 Loop）
- 流程：
  1. 根据 mode 和 modelId 选择可用工具
  2. 调用 PromptService 构建提示词
  3. 调用 LLMService 获取响应
  4. 检查是否有工具调用
  5. 如果有工具调用：
     - 判断是否需要审批
     - 需要审批：触发 `onDidToolCallPending` 事件，暂停 Loop
     - 不需要审批：直接执行工具，继续下一轮
  6. 如果没有工具调用：结束 Loop

**approveToolCall(loopId, toolCallId)**
- 用户批准工具调用后调用
- 恢复 Loop 继续执行

**rejectToolCall(loopId, toolCallId)**
- 用户拒绝工具调用后调用
- 将拒绝信息添加到对话历史
- 可选：继续 Loop 让 LLM 给出替代方案

**abortLoop(loopId)**
- 中断指定的 Loop
- 取消正在进行的 LLM 请求

**核心事件**：
- `onDidLoopUpdate: Event<AgentLoopState>`：Loop 状态更新
- `onDidToolCallPending: Event<ToolCallPendingEvent>`：工具调用等待审批

**模式对比**：

**Agent 模式**
- 启用所有工具（读写文件、搜索、编辑等）
- 支持多轮 Agent Loop
- 适合复杂任务（如"帮我优化项目结构"）

**Chat 模式**
- 只启用只读工具（读文件、搜索）
- 支持有限的工具调用
- 适合问答（如"这个项目有多少文件？"）

**Normal 模式**
- 不启用任何工具
- 纯 LLM 对话
- 适合通用问题（如"LaTeX 如何插入图片？"）

#### 9.2.3 PromptService（提示词构建）

**位置**：`services/agent/PromptService.ts`

**职责**：
- 根据模式构建 System Prompt
- 处理上下文文件
- 组装历史对话
- 截断超长内容
- 拼接工具定义

**核心方法**：

**constructMessages(history, mode, context, options)**
- 参数：
  - `history: ChatMessage[]`：对话历史
  - `mode: ChatMode`：模式
  - `context: ContextItem[]`：上下文
  - `options: PromptBuildOptions`：
    - `modelId: string`
    - `tools: ToolDefinition[]`
- 返回：`LLMMessage[]`（标准的 LLM 消息格式）

**构建流程**：

1. **System Prompt 构建**
   - Agent 模式：
     - 强调工具使用规范
     - 要求先思考再调用工具
     - 说明审批流程
   - Chat 模式：
     - 偏向自然对话
     - 可以使用只读工具获取信息
   - Normal 模式：
     - 标准对话提示

2. **上下文处理**
   - 遍历 `context` 中的文件/片段
   - 通过 `IEditorService` 读取文件内容
   - 对超长文件进行截断（避免超出 token 限制）
   - 包装为消息：
     ```
     以下是 main.tex 的内容：
     [文件内容]
     ```

3. **历史消息处理**
   - 将 `ChatMessage[]` 转换为 `LLMMessage[]`
   - 去除 UI 相关字段（如 `thinking`）
   - 根据 token 限制智能截断历史

4. **工具定义拼接**
   - Agent 模式下，将工具定义添加到提示词
   - 根据模型类型选择格式：
     - OpenAI：JSON Schema 格式
     - Anthropic：XML 格式
     - Gemini：Function Calling 格式

5. **最终组装**
   - 按顺序组装：
     ```
     [System Prompt]
     [Context 包装]
     [历史对话]
     [当前用户消息]
     ```

**Token 限制处理**：
- 从 `IModelRegistryService` 获取模型的 `maxContextTokens`
- 粗略估算 token 数（1 token ≈ 4 字符）
- 优先保留：System Prompt、当前用户消息、最近的对话
- 截断：过长的历史、过大的文件内容

### 9.3 对话消息结构

#### 9.3.1 ChatMessage（UI 消息）

用于 UI 层展示，包含额外的 UI 字段：

**类型**：
- `role: 'user' | 'assistant' | 'tool' | 'system'`
- `content: string`：消息内容
- `thinking?: string`：AI 的思考过程（仅 assistant 消息）
- `toolCalls?: ToolCall[]`：工具调用列表
- `toolResults?: ToolResult[]`：工具执行结果
- `timestamp: number`：时间戳
- `id: string`：消息 ID

#### 9.3.2 LLMMessage（LLM 消息）

标准的 LLM 消息格式，用于与 LLM API 通信：

**类型**：
- `role: 'system' | 'user' | 'assistant' | 'tool'`
- `content: string | ContentPart[]`
- `tool_calls?: ToolCall[]`
- `tool_call_id?: string`：工具调用的 ID（tool 消息专用）

### 9.4 上下文管理

#### 9.4.1 ContextItem（上下文项）

**类型**：
- `type: 'file' | 'selection' | 'outline' | 'image'`
- `file`：文件路径
- `selection`：选中的文本片段
- `outline`：文档大纲
- `image`：图片（多模态）

**使用场景**：
- 用户选中当前文件作为上下文
- 用户选中特定文本片段
- 自动包含文档大纲
- 上传图片进行多模态对话

#### 9.4.2 上下文提供者

**DocumentContextProvider**
- 自动获取当前文档内容
- 提供文档元信息（文件名、行数）

**SelectionContextProvider**
- 获取用户选中的文本
- 提供选区位置信息

**OutlineContextProvider**
- 提取文档大纲（章节、标题）
- 提供结构化视图

**ProjectContextProvider**
- 提供项目文件列表
- 提供项目统计信息

### 9.5 会话持久化

#### 9.5.1 ConversationService

**位置**：`services/agent/ConversationService.ts`

**职责**：
- 保存会话到存储
- 加载历史会话
- 管理会话列表
- 删除会话

**存储格式**：
```
conversation.{id} = {
  id: string,
  title: string,
  messages: ChatMessage[],  // 不包含 thinking 字段
  createdAt: number,
  updatedAt: number,
  modelId: string,
  mode: ChatMode
}
```

**核心方法**：
- `saveConversation(conversation)`：保存会话
- `loadConversation(id)`：加载会话
- `listConversations()`：获取会话列表
- `deleteConversation(id)`：删除会话
- `updateConversationTitle(id, title)`：更新标题

#### 9.5.2 自动标题生成

**策略**：
- 新会话默认标题为"新对话"
- 第一轮对话结束后，自动生成标题
- 使用 LLM 根据对话内容生成（或使用第一个问题）

### 9.6 流式响应处理

#### 9.6.1 为什么需要流式响应？

- **即时反馈**：用户可以立即看到 AI 开始生成
- **更好的体验**：逐字显示比等待完整响应更自然
- **可中断性**：用户可以随时中断生成

#### 9.6.2 流式处理流程

```
LLMService.streamResponse()
   ↓ 生成 StreamResponse 对象
   ↓ 
AgentService 订阅事件：
   ↓
   ├─ onToken: (delta) => {
   │    // 1. 拼接增量到当前 assistant 消息
   │    // 2. 解析 <thinking> 标签
   │    // 3. 触发 onDidLoopUpdate
   │  }
   ↓
   ├─ onDone: (finalMessage) => {
   │    // 1. 标记消息完成
   │    // 2. 检查工具调用
   │    // 3. 决定是否继续 Loop
   │  }
   ↓
   └─ onError: (error) => {
        // 1. 更新错误状态
        // 2. 触发错误事件
      }
```

#### 9.6.3 思考标签解析

部分模型（如 DeepSeek）支持在响应中包含思考过程：

```
<thinking>
用户想要修改标题，我应该先读取文件，
找到标题位置，然后使用 edit_code 工具修改。
</thinking>
我可以帮您修改标题。让我先读取文件内容。
<tool_use name="read_file">
...
</tool_use>
```

**解析规则**：
- 提取 `<thinking>` 标签内容
- 在 UI 中以灰色/折叠方式显示
- 持久化时不保存 thinking（节省存储）

### 9.7 错误处理

#### 9.7.1 常见错误类型

**LLM 错误**
- API Key 无效
- 速率限制
- 网络超时
- 模型不存在

**工具执行错误**
- 文件不存在
- 权限不足
- 参数无效

**系统错误**
- RPC 通信失败
- 内存不足
- 未知异常

#### 9.7.2 错误处理策略

**用户友好的错误信息**
- 不直接显示技术错误
- 提供可操作的建议
- 例如："API Key 无效，请在设置中检查"

**重试机制**
- 网络错误自动重试 3 次
- 指数退避策略
- 用户可手动重试

**降级方案**
- 主模型失败时，尝试备用模型
- Agent 模式失败时，降级到 Chat 模式

---

## 10. 工具系统 (Tools)

### 10.1 工具系统架构

工具系统是 Agent 的"手"，赋予 AI 操作能力。

```
┌─────────────────────────────────────────────────────────────┐
│                     AgentService                             │
│  - 决策哪些工具可用                                          │
│  - 决策是否需要审批                                          │
│  - 调用 ToolService 执行                                     │
└───────────────────────────┬─────────────────────────────────┘
                            │ 依赖 IToolService
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     ToolService                              │
│  - 工具注册表                                                │
│  - 工具执行统一入口                                          │
│  - 工具分类管理                                              │
└───────────────────────────┬─────────────────────────────────┘
                            │ 管理
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   具体工具实现                                │
│  ReadFileTool | EditFileTool | SearchTool | ...             │
│  - 每个工具一个类                                            │
│  - 实现 ITool 接口                                           │
│  - 通过 IEditorService 操作编辑器                            │
└─────────────────────────────────────────────────────────────┘
```

### 10.2 ITool 接口

**定义位置**：`platform/tools/ITool.ts`

**核心属性**：

**name: string**
- 工具的唯一标识符
- LLM 调用时使用的名称
- 示例：`read_file`、`edit_code`

**description: string**
- 给 LLM 的自然语言说明
- 描述工具的功能和使用场景
- 示例："读取指定文件的内容"

**needApproval: boolean**
- 是否需要用户审批
- 敏感操作（修改文件）设为 `true`
- 只读操作设为 `false`

**type: 'read' | 'write' | 'search' | 'external'**
- 工具类型分类
- 用于不同模式下的工具过滤

**parameters: JSONSchema**
- 工具参数的 JSON Schema 定义
- LLM 根据 Schema 生成参数
- 用于参数验证

**核心方法**：

**execute(args): Promise<ToolExecutionResult>**
- 执行工具逻辑
- 参数：从 LLM 解析出的参数对象
- 返回：
  ```
  {
    success: boolean,
    data?: any,
    error?: string
  }
  ```

### 10.3 工具实现详解

#### 10.3.1 BaseTool（工具基类）

**位置**：`services/agent/tools/base/BaseTool.ts`

**提供的能力**：
- 参数验证逻辑
- 错误处理模板
- 执行时间统计
- 日志记录

**子类只需实现**：
- `_execute(args)`：具体的执行逻辑

#### 10.3.2 ReadFileTool（读取文件）

**name**: `read_file`

**description**: "读取指定文件的完整内容"

**needApproval**: `false`（只读操作）

**parameters**:
```
{
  type: 'object',
  properties: {
    fileName: {
      type: 'string',
      description: '要读取的文件名（如 main.tex）'
    }
  },
  required: ['fileName']
}
```

**执行逻辑**：
1. 通过 `IEditorService.getEditorFullText(fileName)` 读取文件
2. 返回文件内容
3. 如果文件不存在，返回错误

**使用场景**：
- AI 需要查看文件内容以回答问题
- AI 需要分析代码结构

#### 10.3.3 EditFileTool（编辑文件）

**name**: `edit_file`

**description**: "修改指定文件的内容"

**needApproval**: `true`（敏感操作）

**parameters**:
```
{
  type: 'object',
  properties: {
    fileName: {
      type: 'string',
      description: '要编辑的文件名'
    },
    searchText: {
      type: 'string',
      description: '要替换的原文（必须唯一）'
    },
    replaceText: {
      type: 'string',
      description: '替换后的新文本'
    }
  },
  required: ['fileName', 'searchText', 'replaceText']
}
```

**执行逻辑**：
1. 切换到目标文件
2. 读取文件内容
3. 查找 `searchText`
4. 如果唯一，执行替换
5. 如果不唯一或不存在，返回错误

**审批流程**：
- AgentService 检测到此工具调用
- 触发 `onDidToolCallPending` 事件
- UI 显示审批弹窗（显示要修改的内容）
- 用户批准后，AgentService 调用 `execute()`

#### 10.3.4 GrepSearchTool（文本搜索）

**name**: `grep_search`

**description**: "在整个项目中搜索文本"

**needApproval**: `false`

**parameters**:
```
{
  type: 'object',
  properties: {
    pattern: {
      type: 'string',
      description: '搜索模式（支持正则）'
    },
    caseSensitive: {
      type: 'boolean',
      description: '是否区分大小写',
      default: false
    }
  },
  required: ['pattern']
}
```

**执行逻辑**：
1. 通过 overleafBridge 调用 `searchProject()`
2. 返回匹配结果（文件名、行号、匹配内容）

**使用场景**：
- AI 需要查找某个宏定义的位置
- AI 需要统计某个词的出现次数

#### 10.3.5 LatexCodeBaseSearch（LaTeX 语义搜索）

**name**: `latex_codebase_search`

**description**: "在项目中进行语义搜索，理解 LaTeX 结构"

**needApproval**: `false`

**parameters**:
```
{
  type: 'object',
  properties: {
    query: {
      type: 'string',
      description: '搜索查询（自然语言）'
    }
  },
  required: ['query']
}
```

**执行逻辑**：
1. 获取所有项目文件内容
2. 解析 LaTeX 结构（章节、公式、引用等）
3. 使用语义匹配查找相关部分
4. 返回最相关的代码片段

**与 grep 的区别**：
- grep：精确文本匹配
- codebase_search：语义理解匹配
- 例如："查找关于机器学习的章节"

#### 10.3.6 ListDirTool（列出文件）

**name**: `list_dir`

**description**: "列出项目中的所有文件"

**needApproval**: `false`

**执行逻辑**：
1. 通过 `IEditorService.readFileTree()` 获取文件树
2. 返回文件列表（包含类型、层级）

#### 10.3.7 WebSearchTool（网络搜索）

**name**: `web_search`

**description**: "搜索互联网获取最新信息"

**needApproval**: `false`

**parameters**:
```
{
  type: 'object',
  properties: {
    query: {
      type: 'string',
      description: '搜索查询'
    }
  },
  required: ['query']
}
```

**执行逻辑**：
1. 调用搜索 API（如 Google、Bing）
2. 返回搜索结果（标题、摘要、链接）

**使用场景**：
- 查找最新的 LaTeX 包用法
- 查找文献信息

#### 10.3.8 PaperSemanticSearchTool（论文搜索）

**name**: `paper_semantic_search`

**description**: "搜索学术论文（Semantic Scholar）"

**needApproval**: `false`

**执行逻辑**：
1. 调用 Semantic Scholar API
2. 返回相关论文（标题、作者、摘要、引用数）

### 10.4 ToolService 实现

**位置**：`services/agent/ToolService.ts`

**核心数据结构**：
```
private tools: Map<string, ITool> = new Map();
```

**核心方法**：

**registerTool(tool: ITool)**
- 将工具实例注册到 Map
- 检查名称是否冲突

**getTool(name: string): ITool | undefined**
- 根据名称查找工具
- 返回工具实例或 undefined

**executeTool(name: string, args: any): Promise<ToolExecutionResult>**
- 统一的工具执行入口
- 流程：
  1. 查找工具实例
  2. 记录开始时间
  3. 调用 `tool.execute(args)`
  4. 记录执行时间
  5. 捕获异常并包装为 ToolExecutionResult
  6. 返回结果

**listTools(): ITool[]**
- 返回所有已注册工具

**getReadOnlyTools(): ITool[]**
- 返回所有 `type === 'read' || type === 'search'` 的工具
- 用于 Chat 模式

**getAllTools(): ITool[]**
- 返回所有工具
- 用于 Agent 模式

**initializeBuiltInTools()**
- 在构造函数中调用
- 注册所有内置工具

### 10.5 工具注册流程

**时机**：应用启动时，在 DI 容器初始化后

**流程**：
1. ToolService 实例化
2. 调用 `initializeBuiltInTools()`
3. 依次实例化每个工具类
4. 调用 `registerTool()` 注册

### 10.6 工具调用流程

**完整流程**：

1. **用户提问**："帮我把 main.tex 的标题改成 Hello World"

2. **AgentService 构建提示词**
   - 包含可用工具列表
   - 包含工具的参数 Schema

3. **LLM 返回工具调用**
   ```
   {
     tool_calls: [{
       name: 'edit_file',
       arguments: {
         fileName: 'main.tex',
         searchText: '\\title{Old Title}',
         replaceText: '\\title{Hello World}'
       }
     }]
   }
   ```

4. **AgentService 检测工具调用**
   - 调用 `ToolService.getTool('edit_file')`
   - 检查 `tool.needApproval`
   - 因为是 `true`，触发审批流程

5. **UI 显示审批弹窗**
   - 用户看到："AI 想要修改 main.tex：..."
   - 用户点击"批准"

6. **AgentService 执行工具**
   - 调用 `ToolService.executeTool('edit_file', args)`
   - ToolService 调用 EditFileTool.execute()
   - EditFileTool 通过 IEditorService 修改文件

7. **工具返回结果**
   ```
   {
     success: true,
     data: '已成功修改标题'
   }
   ```

8. **AgentService 继续 Loop**
   - 将工具结果添加到对话历史
   - 再次调用 LLM
   - LLM 返回："已为您将标题修改为 Hello World。"

9. **结束**

### 10.7 工具开发规范

#### 10.7.1 工具命名

- 使用 snake_case（如 `read_file`）
- 动词开头，表达清晰的动作
- 避免缩写

#### 10.7.2 参数设计

- 必需参数应该最少
- 提供合理的默认值
- 使用 JSON Schema 详细描述参数
- 参数名清晰易懂

#### 10.7.3 错误处理

- 所有错误都应该被捕获
- 返回清晰的错误信息
- 不要抛出未捕获的异常

#### 10.7.4 幂等性

- 只读工具天然幂等
- 写入工具应该尽可能幂等
- 例如：多次调用 `edit_file` 应该是安全的

#### 10.7.5 文档

- description 应该清晰描述工具功能
- 参数的 description 应该说明用途
- 提供使用示例

### 10.8 工具审批设计

**为什么需要审批？**
- 敏感操作需要用户确认
- 防止 AI 错误操作
- 提供最后一道安全屏障

**哪些工具需要审批？**
- 修改文件内容
- 删除文件
- 执行系统命令（如果支持）

**审批界面设计**：
- 清晰显示工具名称和要执行的操作
- 显示关键参数（如要修改的文件、修改内容）
- 提供"批准"和"拒绝"按钮
- 可选：显示 diff 预览

**用户拒绝后的处理**：
- 将拒绝信息加入对话历史
- 让 LLM 知道用户拒绝了操作
- LLM 可以给出解释或替代方案

---

## 11. LLM 服务与适配器

### 11.1 LLM 服务架构

```
┌─────────────────────────────────────────────────────────────┐
│                     AgentService                             │
│  - 调用 ILLMService.streamResponse()                         │
│  - 处理流式响应                                              │
└───────────────────────────┬─────────────────────────────────┘
                            │ 依赖 ILLMService
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      LLMService                              │
│  职责：纯粹的 HTTP 客户端                                     │
│  - 发送 HTTP 请求                                           │
│  - 解析流式响应                                              │
│  - 不关心厂商差异                                            │
└───────────────────────────┬─────────────────────────────────┘
                            │ 依赖 ILLMProviderService
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                 LLMProviderService                           │
│  职责：厂商适配层                                            │
│  - 根据 modelId 选择适配器                                   │
│  - 转换请求格式                                              │
│  - 提供流解析策略                                            │
└───────────────────────────┬─────────────────────────────────┘
                            │ 使用不同的适配器
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     LLM 适配器                               │
│  ┌──────────┐ ┌──────────────┐ ┌────────────────┐          │
│  │ OpenAI   │ │ OpenAI Comp. │ │ Anthropic      │          │
│  │ Adapter  │ │ Adapter      │ │ Adapter        │          │
│  └──────────┘ └──────────────┘ └────────────────┘          │
│  - GPT-4    - DeepSeek        - Claude                      │
│  - o1       - Gemini          - Haiku/Sonnet/Opus           │
└─────────────────────────────────────────────────────────────┘
```

### 11.2 核心概念

#### 11.2.1 为什么需要适配器？

不同 LLM 厂商的 API 存在差异：

**OpenAI**
- Endpoint: `/v1/chat/completions`
- System Prompt: 作为消息数组的一部分
- 工具调用: `tools` 数组
- 流式: SSE 格式

**Anthropic (Claude)**
- Endpoint: `/v1/messages`
- System Prompt: 单独的 `system` 参数
- 工具调用: 不同的格式
- 流式: SSE 格式但结构不同

**OpenAI Compatible (DeepSeek, Gemini等)**
- 兼容 OpenAI API
- 但参数名可能不同（如 `max_tokens` vs `max_completion_tokens`）
- 支持的参数集合不同

**适配器的作用**：
- 隐藏这些差异
- 提供统一的调用接口
- 让上层代码不关心具体厂商

#### 11.2.2 ModelRegistryService（模型注册表）

**位置**：`services/llm/ModelRegistryService.ts`

**职责**：
- 管理所有支持的模型
- 提供模型能力查询
- 提供模型默认配置

**核心数据结构**：
```
private models: Map<ModelId, ModelInfo> = new Map([
  ['gpt-4o', {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    capabilities: {
      supportsTools: true,
      supportsVision: true,
      supportsReasoning: false,
      maxContextTokens: 128000,
      maxOutputTokens: 4096
    },
    defaultConfig: {
      temperature: 0.7,
      top_p: 1.0
    }
  }],
  ['deepseek-chat', {
    id: 'deepseek-chat',
    name: 'DeepSeek Chat',
    provider: 'openai-compatible',
    capabilities: {
      supportsTools: true,
      supportsReasoning: true,  // 支持 <thinking>
      maxContextTokens: 65536,
      maxOutputTokens: 8192
    }
  }],
  // ...
]);
```

**核心方法**：
- `getModel(modelId): ModelInfo | undefined`
- `getCapabilities(modelId): ModelCapabilities`
- `getDefaultConfig(modelId): ModelConfig`
- `listModels(): ModelInfo[]`

### 11.3 适配器系统

#### 11.3.1 BaseLLMProvider（适配器基类）

**位置**：`services/llm/adapters/BaseLLMProvider.ts`

**抽象方法**（子类必须实现）：

**buildRequest(messages, config, apiConfig)**
- 构建 HTTP 请求对象
- 返回：
  ```
  {
    url: string,
    headers: Record<string, string>,
    body: any
  }
  ```

**parseStreamChunk(dataString)**
- 解析流式响应的一个 chunk
- 返回：
  ```
  {
    type: 'delta' | 'done' | 'error',
    delta?: string,
    toolCalls?: ToolCall[],
    finishReason?: string
  }
  ```

**辅助方法**（基类提供）：
- `transformMessages(messages)`: 转换消息格式
- `buildHeaders(apiKey)`: 构建请求头
- `handleError(error)`: 统一错误处理

#### 11.3.2 OpenAIAdapter

**位置**：`services/llm/adapters/OpenAIProvider.ts`

**支持的模型**：
- GPT-4 系列：gpt-4, gpt-4-turbo, gpt-4o
- GPT-3.5 系列：gpt-3.5-turbo
- o1 系列：o1-preview, o1-mini

**请求格式**：
```
POST https://api.openai.com/v1/chat/completions

{
  model: 'gpt-4o',
  messages: [...],
  temperature: 0.7,
  stream: true,
  tools: [...]  // 如果有工具
}
```

**特殊处理**：
- o1 模型不支持 system prompt（需要转换为 user 消息）
- o1 模型不支持 temperature 参数
- 工具调用使用标准的 `tools` 数组

**流式响应格式**：
```
data: {"choices":[{"delta":{"content":"你好"}}]}
data: {"choices":[{"delta":{"tool_calls":[...]}}]}
data: [DONE]
```

#### 11.3.3 OpenAICompatibleAdapter

**位置**：`services/llm/adapters/OpenAICompatibleProvider.ts`

**支持的模型**：
- DeepSeek: deepseek-chat, deepseek-coder
- Gemini (通过 OpenAI 兼容端点)

**与 OpenAI 的差异**：

**DeepSeek**
- 支持 `<thinking>` 标签
- 使用 `max_tokens` 而非 `max_completion_tokens`
- 工具调用格式相同

**Gemini**
- 某些参数名不同
- 不支持部分 OpenAI 参数

**适配策略**：
- 继承 OpenAIAdapter
- 覆盖参数映射逻辑
- 添加厂商特定的处理

#### 11.3.4 AnthropicAdapter

**位置**：`services/llm/adapters/AnthropicProvider.ts`

**支持的模型**：
- Claude 3 系列：claude-3-opus, claude-3-sonnet, claude-3-haiku
- Claude 3.5: claude-3-5-sonnet

**请求格式差异**：
```
POST https://api.anthropic.com/v1/messages

{
  model: 'claude-3-5-sonnet-20241022',
  system: 'You are a helpful assistant...',  // 单独参数
  messages: [...],  // 不包含 system 消息
  max_tokens: 4096,  // 必需参数
  stream: true,
  tools: [...]  // 格式不同
}
```

**关键差异**：
1. **system 参数单独传递**
   - OpenAI: system 是消息数组的一部分
   - Anthropic: system 是顶层参数

2. **max_tokens 是必需的**
   - OpenAI: 可选
   - Anthropic: 必须提供

3. **工具定义格式不同**
   - 需要转换工具 Schema

**流式响应格式**：
```
data: {"type":"content_block_start","content_block":{"type":"text","text":""}}
data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"你好"}}
data: {"type":"message_stop"}
```

### 11.4 LLMProviderService 实现

**位置**：`services/llm/LLMProviderService.ts`

**核心方法**：

**getAdapter(modelId): BaseLLMProvider**
- 根据 modelId 查询 ModelRegistry
- 获取 provider 类型
- 返回对应的适配器实例

**buildRequest(messages, config)**
- 获取适配器
- 调用 `adapter.buildRequest()`
- 返回标准化的请求对象

**parseStreamChunk(dataString, provider)**
- 获取适配器
- 调用 `adapter.parseStreamChunk()`
- 返回标准化的解析结果

### 11.5 LLMService 实现

**位置**：`services/llm/LLMService.ts`

**职责**：
- 纯粹的 HTTP 客户端
- 不关心厂商差异（由 ProviderService 处理）

**核心方法**：

**streamResponse(messages, config): Promise<StreamResponse>**

**流程**：
1. 调用 `providerService.buildRequest(messages, config)`
2. 发起 HTTP 请求（设置 `stream: true`）
3. 读取响应流（Server-Sent Events）
4. 逐个解析 chunk：
   - 调用 `providerService.parseStreamChunk(chunk, provider)`
   - 触发 `onToken` 事件
5. 流结束时触发 `onDone` 事件
6. 错误时触发 `onError` 事件

**StreamResponse 接口**：
```
interface StreamResponse {
  onToken: Event<LLMDeltaChunk>,
  onDone: Event<LLMFinalMessage>,
  onError: Event<Error>,
  cancel: () => void
}
```

**取消机制**：
- 保存 AbortController
- `cancel()` 调用 `controller.abort()`
- 中断 HTTP 请求

### 11.6 流式响应处理

#### 11.6.1 Server-Sent Events (SSE)

**格式**：
```
data: {"id":"1","delta":"你好"}
data: {"id":"1","delta":"，"}
data: {"id":"1","delta":"世界"}
data: [DONE]
```

**解析流程**：
1. 按行读取响应流
2. 识别 `data:` 前缀
3. 解析 JSON
4. 提取增量内容
5. 触发事件

#### 11.6.2 增量拼接

**AgentService 中的处理**：
```
let currentContent = '';

llmService.streamResponse(messages, config)
  .then(stream => {
    stream.onToken((chunk) => {
      currentContent += chunk.delta;
      // 更新 UI 显示
      this.updateAssistantMessage(currentContent);
    });
    
    stream.onDone((finalMessage) => {
      // 标记完成
      this.markMessageComplete(currentContent);
    });
  });
```

### 11.7 错误处理

#### 11.7.1 常见错误

**401 Unauthorized**
- API Key 无效
- API Key 过期
- 提示用户检查设置

**429 Too Many Requests**
- 速率限制
- 自动重试（指数退避）
- 提示用户稍后再试

**500 Internal Server Error**
- LLM 服务端错误
- 自动重试
- 提示用户切换模型

**Network Error**
- 网络连接问题
- 自动重试
- 检查网络设置

#### 11.7.2 重试策略

**指数退避**：
- 第 1 次重试：等待 1 秒
- 第 2 次重试：等待 2 秒
- 第 3 次重试：等待 4 秒
- 最多重试 3 次

**可重试的错误**：
- 网络超时
- 429 速率限制
- 5xx 服务器错误

**不可重试的错误**：
- 401 认证错误
- 400 参数错误
- 超出 token 限制

### 11.8 模型配置

#### 11.8.1 ModelConfig

**核心参数**：

**temperature: number**
- 控制输出随机性
- 范围：0.0 - 2.0
- 0.0：最确定性，适合代码生成
- 1.0：平衡
- 2.0：最随机，适合创意写作

**top_p: number**
- 核采样参数
- 范围：0.0 - 1.0
- 通常与 temperature 二选一

**max_tokens: number**
- 最大输出 token 数
- 不同模型限制不同

**reasoning_effort: 'low' | 'medium' | 'high'**
- o1 模型专用
- 控制推理深度

**thinking_enabled: boolean**
- DeepSeek 模型专用
- 是否启用思考标签

#### 11.8.2 用户配置

用户可以在设置中配置：
- 默认模型
- Temperature
- Max Tokens
- API Key
- Base URL（自定义端点）

### 11.9 多模态支持

#### 11.9.1 图片输入

**支持的模型**：
- GPT-4o, GPT-4-turbo
- Claude 3 系列
- Gemini Pro Vision

**消息格式**：
```
{
  role: 'user',
  content: [
    {
      type: 'text',
      text: '这张图片是什么？'
    },
    {
      type: 'image_url',
      image_url: {
        url: 'data:image/png;base64,...'
      }
    }
  ]
}
```

**使用场景**：
- 用户上传 LaTeX 生成的图片，询问如何改进
- 用户上传论文截图，询问如何复现

---

## 12. 文本操作系统

### 12.1 系统概述

文本操作系统提供快速的 AI 辅助文本处理功能，独立于主对话系统。

**核心功能**：
- **扩写**：将简短文本扩展为详细内容
- **缩写**：将冗长文本精简
- **润色**：优化语言表达
- **翻译**：中英文互译
- **自定义**：用户自定义操作

**使用方式**：
- 用户选中文本
- 自动显示操作菜单
- 或按 Ctrl+Alt+/ 唤起菜单
- 点击操作或输入自定义要求
- AI 生成结果并显示预览
- 用户确认后替换

### 12.2 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│  Overleaf 页面                                               │
│  ┌───────────────────────────────────────────────┐          │
│  │  overleafBridge.js                            │          │
│  │  - 检测文本选区                                │          │
│  │  - 显示操作菜单                                │          │
│  │  - 发送操作请求                                │          │
│  │  - 显示预览覆盖层                              │          │
│  └─────────────────┬─────────────────────────────┘          │
└────────────────────┼─────────────────────────────────────────┘
                     │ window.postMessage
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  Content Script                                              │
│  ┌───────────────────────────────────────────────┐          │
│  │  TextActionService                            │          │
│  │  - 监听操作请求                                │          │
│  │  - 调用 AI 服务                                │          │
│  │  - 返回结果                                    │          │
│  └─────────────────┬─────────────────────────────┘          │
└────────────────────┼─────────────────────────────────────────┘
                     │ chrome.runtime.sendMessage
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  Sidepanel                                                   │
│  ┌───────────────────────────────────────────────┐          │
│  │  TextActionAIService                          │          │
│  │  - 接收操作请求                                │          │
│  │  - 构建提示词                                  │          │
│  │  - 调用 LLMService                             │          │
│  │  - 流式返回结果                                │          │
│  └───────────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────┘
```

### 12.3 核心组件

#### 12.3.1 overleafBridge.js - 选区工具提示

**功能组件**：

**1. 选区检测**
- 监听 `mouseup` 事件
- 获取选区信息（from, to, text）
- 计算选区位置

**2. 工具提示菜单**
- 自定义输入框（支持任意操作）
- 快捷操作按钮：
  - 扩写（绿色）
  - 缩写（橙色）
  - 润色（蓝色）
  - 翻译（紫色）
- 模型选择器
- 发送按钮

**3. 位置计算**
- 在选区附近显示菜单
- 自动避免超出视口
- 支持拖拽移动（预览窗口）

**4. 快捷键**
- `Ctrl+Alt+/`：唤起菜单
- `ESC`：关闭菜单
- `Enter`：发送自定义输入

**5. 模式切换**
- **选中文本模式**：显示完整菜单
- **光标模式**（快捷键唤起）：只显示输入框（插入模式）

#### 12.3.2 TextActionService（Content Script）

**位置**：`services/editor/TextActionService.ts`

**职责**：
- 监听 overleafBridge 的操作请求
- 转发请求到 Sidepanel
- 处理流式响应
- 返回结果到 overleafBridge

**核心方法**：

**handleTextActionRequest(request)**
- 参数：
  ```
  {
    action: 'expand' | 'condense' | 'polish' | 'translate' | 'custom',
    text: string,
    from: number,
    to: number,
    modelId: string,
    customPrompt?: string,
    contextBefore?: string,  // 选区前的上下文
    contextAfter?: string    // 选区后的上下文
  }
  ```
- 流程：
  1. 验证请求
  2. 通过 RPC 转发到 Sidepanel
  3. 监听流式响应
  4. 转发到 overleafBridge 显示预览

**handlePreviewDecision(accepted)**
- 处理用户的预览决策
- 如果接受：通知 overleafBridge 替换文本
- 如果拒绝：清除预览

#### 12.3.3 TextActionAIService（Sidepanel）

**位置**：`services/agent/TextActionAIService.ts`

**职责**：
- 接收 RPC 请求
- 构建针对文本操作的提示词
- 调用 LLMService
- 流式返回结果

**提示词模板**：

**扩写（Expand）**
```
你是一个专业的 LaTeX 学术写作助手。
用户选中了以下文本：
[原文]

上下文：
[前文]
...
[后文]

请将这段文本扩展为更详细、更学术的表达，保持：
- LaTeX 格式不变
- 学术写作风格
- 逻辑连贯
- 与上下文衔接

只输出扩写后的文本，不要解释。
```

**缩写（Condense）**
```
请将以下文本精简，保持核心观点和 LaTeX 格式：
[原文]

只输出精简后的文本。
```

**润色（Polish）**
```
请润色以下文本，优化语言表达，保持 LaTeX 格式：
[原文]

只输出润色后的文本。
```

**翻译（Translate）**
```
请将以下文本翻译（中译英或英译中），保持 LaTeX 格式：
[原文]

只输出翻译结果。
```

**自定义（Custom）**
```
用户要求：[customPrompt]

原文：
[原文]

上下文：
[前文]
...
[后文]

请按照用户要求处理文本，保持 LaTeX 格式。
只输出处理后的文本。
```

**核心方法**：

**processTextAction(request): AsyncGenerator<string>**
- 异步生成器，流式返回结果
- 流程：
  1. 根据 action 选择提示词模板
  2. 填充原文和上下文
  3. 调用 `llmService.streamResponse()`
  4. 逐个 yield delta
  5. 完成后返回

### 12.4 预览系统

#### 12.4.1 预览覆盖层

**位置**：在 overleafBridge.js 中实现

**UI 组件**：

**1. 预览窗口**
- 半透明背景（毛玻璃效果）
- 可拖拽移动
- 自适应位置
- 关闭按钮

**2. 内容区域**
- 原文区：显示为删除线（红色背景）
- 箭头指示
- 新文本区：高亮显示（绿色背景）
- 可滚动（如果内容过长）

**3. 流式显示**
- 生成过程中逐字显示新文本
- 光标动画（闪烁的竖线）
- 生成完成后显示确认按钮

**4. 确认按钮**
- 内置在预览窗口底部
- 接受（绿色）
- 拒绝（红色）

**5. 特殊模式：插入模式**
- 无选中文本时（快捷键唤起）
- 隐藏原文区和箭头
- 只显示生成的新内容
- 标题改为"生成内容"

#### 12.4.2 流式预览流程

**1. 开始预览**
- TextActionService 收到请求
- 发送 `OVERLEAF_STREAM_PREVIEW_START` 消息
- overleafBridge 显示预览窗口
- 原文区显示原文（或隐藏）
- 新文本区显示"AI 正在生成..."

**2. 更新预览**
- TextActionService 收到 LLM delta
- 发送 `OVERLEAF_STREAM_PREVIEW_UPDATE` 消息
- overleafBridge 拼接新文本
- 更新新文本区（带光标动画）

**3. 完成预览**
- LLM 生成完成
- 发送 `OVERLEAF_STREAM_PREVIEW_COMPLETE` 消息
- overleafBridge 移除光标动画
- 显示确认按钮

**4. 用户决策**
- 用户点击"接受"或"拒绝"
- 发送 `OVERLEAF_PREVIEW_DECISION` 消息
- 如果接受：调用 overleafBridge 的替换方法
- 清除预览窗口

#### 12.4.3 取消机制

**触发方式**：
- 点击关闭按钮
- 点击拒绝按钮
- 按 ESC 键
- 点击预览窗口外部

**处理流程**：
1. 发送 `OVERLEAF_STREAM_CANCEL` 消息
2. TextActionService 调用 `llmService.cancel()`
3. 中断 LLM 请求
4. 清除预览窗口

### 12.5 上下文感知

**为什么需要上下文？**
- 提高操作准确性
- 保持语义连贯
- 符合文档风格

**上下文提取**：
- 选区前 15 行
- 选区后 15 行
- 通过 `getSelectionContext()` 实现

**使用示例**：

**原文**：
```
We propose a novel approach.
```

**前文**：
```
Recent studies have shown that deep learning models...
In this paper, we focus on image classification...
```

**后文**：
```
The experimental results demonstrate...
```

**扩写结果**（有上下文）：
```
Building upon recent advances in deep learning for image classification,
we propose a novel approach that addresses the limitations of existing methods.
Our method leverages...
```

**扩写结果（无上下文）**：
```
We propose a novel approach that uses machine learning techniques
to solve problems in various domains.
```

**对比**：有上下文的扩写更符合文档主题。

### 12.6 模型选择

**模型选择器**：
- 显示在工具提示菜单底部
- 下拉框形式
- 保存用户选择到 localStorage
- 默认使用 gpt-4o-mini（快速+便宜）

**推荐模型**：

**快速操作（扩写/缩写/润色）**
- gpt-4o-mini：快速、便宜
- claude-3-haiku：快速、质量高

**翻译**
- gpt-4o：翻译质量最佳
- claude-3-5-sonnet：理解上下文能力强

**自定义复杂操作**
- gpt-4o：平衡
- claude-3-5-sonnet：理解能力最强
- o1-preview：复杂推理

### 12.7 错误处理

**常见错误**：
- LLM 生成失败
- 网络超时
- 选区失效（用户修改了文本）

**处理策略**：
- 显示友好的错误提示
- 提供重试按钮
- 允许用户手动关闭预览

### 12.8 性能优化

**减少延迟**：
- 使用快速模型（如 gpt-4o-mini）
- 流式输出，逐字显示
- 预加载模型列表

**减少成本**：
- 默认使用便宜的模型
- 限制上下文长度（前后各 15 行）
- 不在提示词中包含不必要的信息

**用户体验**：
- 立即显示预览窗口（即使还未开始生成）
- 流式显示给用户即时反馈
- 支持取消操作

---

## 第四部分：用户界面

---

## 13. Workbench 层 (UI)

### 13.1 Workbench 设计原则

**核心原则：哑巴组件（Dumb Components）**
- 组件只负责展示，不包含业务逻辑
- 所有状态来自 Service 层
- 所有操作通过 Service 层执行
- 组件应该是纯粹的：相同输入产生相同输出

**为什么这样设计？**
- **可测试性**：组件测试只需 mock props
- **可复用性**：组件不绑定具体业务
- **可维护性**：业务逻辑集中在 Service 层
- **UI 可替换**：可以轻松更换 UI 框架

### 13.2 核心组件

#### 13.2.1 App.tsx（应用根组件）

**位置**：`workbench/parts/App.tsx`

**职责**：
- 初始化 DI 容器
- 注册所有服务
- 提供 DI Context
- 渲染主界面

**关键代码模式**：

服务注册顺序很重要：
1. 基础服务（Storage, Configuration）
2. 编辑器服务（EditorServiceProxy）
3. LLM 服务（ModelRegistry, LLMService）
4. Agent 服务（ToolService, PromptService, AgentService, ChatService）
5. UI 服务（UIStreamService）

#### 13.2.2 Sidebar.tsx（侧边栏）

**位置**：`workbench/parts/Sidebar.tsx`

**职责**：
- 整体布局容器
- 包含对话面板
- 包含设置面板
- 管理面板切换

**布局结构**：
```
┌─────────────────────────────────────┐
│  Header (Logo + Settings Button)   │
├─────────────────────────────────────┤
│                                     │
│  ConversationPane                   │
│  (对话界面)                          │
│                                     │
│                                     │
├─────────────────────────────────────┤
│  Footer (Version + Status)          │
└─────────────────────────────────────┘
```

**响应式设计**：
- 支持拖拽调整宽度
- 最小宽度：360px
- 最大宽度：800px
- 宽度保存到 localStorage

#### 13.2.3 ConversationPane.tsx（对话面板）

**位置**：`workbench/parts/ConversationPane.tsx`

**职责**：
- 显示对话消息列表
- 提供输入框
- 提供模型选择器
- 提供模式切换
- 提供上下文选择

**核心 Hooks**：
```typescript
// 获取服务
const chatService = useService<IChatService>(IChatServiceId);
const editorService = useService<IEditorService>(IEditorServiceId);

// 订阅消息更新
const messages = useServiceEvent(
  chatService.onDidMessageUpdate,
  []
);

// 订阅工具审批事件
const pendingTool = useServiceEvent(
  chatService.onDidToolCallPending,
  null
);
```

**消息渲染**：
- User 消息：右对齐，蓝色背景
- Assistant 消息：左对齐，灰色背景
  - 包含 thinking 时：可折叠显示
  - content 部分：Markdown 渲染
  - 工具调用：特殊样式显示
- Tool 消息：系统样式，显示工具执行结果

**输入区域**：
- 富文本输入框（支持多行）
- 发送按钮
- 停止按钮（生成中显示）
- 模型选择下拉框
- 模式切换按钮（Agent / Chat / Normal）
- 上下文文件选择

**工具审批弹窗**：
- 显示在消息列表下方
- 包含：
  - 工具名称
  - 要执行的操作描述
  - 关键参数预览
  - 批准/拒绝按钮

#### 13.2.4 MarkdownRenderer.tsx（Markdown 渲染器）

**位置**：`workbench/parts/MarkdownRenderer.tsx`

**职责**：
- 渲染 Assistant 消息的 Markdown 内容
- 支持 LaTeX 公式渲染
- 支持代码高亮
- 支持链接点击

**使用的库**：
- `react-markdown`：Markdown 解析
- `remark-math` + `rehype-katex`：LaTeX 公式
- `react-syntax-highlighter`：代码高亮

**特殊处理**：
- LaTeX 公式：`$...$` 和 `$$...$$`
- 代码块：语言标识和行号
- 链接：在新标签页打开

#### 13.2.5 ToolResultRenderer.tsx（工具结果渲染器）

**位置**：`workbench/parts/ToolResultRenderer.tsx`

**职责**：
- 渲染工具执行结果
- 不同工具类型使用不同样式

**渲染策略**：

**read_file**：
- 显示文件名
- 折叠显示文件内容
- 支持代码高亮

**grep_search**：
- 显示匹配数量
- 列表显示每个匹配项
- 包含文件名、行号、上下文

**edit_file**：
- 显示修改摘要
- Diff 视图（可选）

**web_search**：
- 列表显示搜索结果
- 包含标题、摘要、链接

#### 13.2.6 RichTextInput.tsx（富文本输入框）

**位置**：`workbench/parts/RichTextInput.tsx`

**功能**：
- 多行输入
- 自动高度调整
- @文件 提及功能
- Enter 发送，Shift+Enter 换行
- 粘贴图片支持（多模态）

**提及功能**：
- 输入 `@` 触发
- 显示文件列表
- 选择后插入文件引用
- 自动添加到上下文

#### 13.2.7 ActivationModal.tsx（激活弹窗）

**位置**：`workbench/parts/ActivationModal.tsx`

**职责**：
- 显示激活提示
- 输入激活码
- 验证激活状态
- 显示激活成功/失败

**激活流程**：
1. 用户输入激活码
2. 发送到验证服务器
3. 保存激活状态到 Storage
4. 更新 UI 状态
5. 关闭弹窗

### 13.3 样式系统

#### 13.3.1 CSS Modules vs Tailwind

**当前使用**：纯 CSS 文件

**文件位置**：
- `workbench/styles/sidebar.css`
- `workbench/styles/popup.css`

**优点**：
- 简单直接
- 不需要额外配置
- 文件小

**未来考虑**：
- Tailwind CSS：快速开发
- CSS-in-JS：动态样式

#### 13.3.2 设计规范

**颜色主题**：
- 主色：蓝色 (#3b82f6)
- 成功：绿色 (#10b981)
- 警告：橙色 (#f59e0b)
- 错误：红色 (#ef4444)
- 背景：深色 (#1e293b)
- 文字：浅色 (#e5e7eb)

**间距规范**：
- xs: 4px
- sm: 8px
- md: 16px
- lg: 24px
- xl: 32px

**圆角**：
- 按钮：6px
- 卡片：12px
- 弹窗：16px

**阴影**：
- 悬浮元素：0 4px 12px rgba(0,0,0,0.15)
- 弹窗：0 20px 25px rgba(0,0,0,0.2)

### 13.4 响应式设计

#### 13.4.1 Sidepanel 宽度

- 默认：400px
- 最小：360px
- 最大：800px
- 用户可拖拽调整
- 宽度保存到 localStorage

#### 13.4.2 消息列表滚动

- 自动滚动到底部（新消息时）
- 用户手动滚动时暂停自动滚动
- 向下箭头按钮快速回到底部

#### 13.4.3 移动端适配

虽然主要面向桌面端，但仍需考虑：
- 触摸操作
- 小屏幕布局
- 虚拟键盘

### 13.5 无障碍（Accessibility）

#### 13.5.1 键盘导航

- Tab：焦点切换
- Enter：发送消息
- ESC：关闭弹窗
- 方向键：消息列表导航

#### 13.5.2 ARIA 标签

- 按钮：`aria-label`
- 输入框：`aria-describedby`
- 弹窗：`role="dialog"`
- 列表：`role="list"`

#### 13.5.3 颜色对比

- 文字与背景对比度 ≥ 4.5:1
- 链接可识别（不仅依赖颜色）
- 错误提示有图标辅助

---

## 14. React Hooks 系统

### 14.1 Hooks 架构

React Hooks 是连接 UI 和 Service 层的桥梁。

```
┌─────────────────────────────────────────────────────────────┐
│  React Component                                             │
│  ┌───────────────────────────────────────────┐              │
│  │  const service = useService(IServiceId)   │              │
│  │  const data = useServiceEvent(event, [])  │              │
│  └───────────────────────────────────────────┘              │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  DI Context                                                  │
│  - 提供 InstantiationService 实例                            │
│  - 所有组件共享同一个 DI 容器                                │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Service Layer                                               │
│  - 真实的业务逻辑                                            │
│  - 通过事件通知 UI 更新                                      │
└─────────────────────────────────────────────────────────────┘
```

### 14.2 核心 Hooks

#### 14.2.1 useService

**位置**：`workbench/hooks/useService.ts`

**作用**：从 DI 容器中获取服务实例

**签名**：
```typescript
function useService<T>(serviceId: ServiceIdentifier<T>): T
```

**使用示例**：
```typescript
const chatService = useService<IChatService>(IChatServiceId);
const editorService = useService<IEditorService>(IEditorServiceId);
```

**内部实现**：
1. 通过 `useContext(DIContext)` 获取 DI 容器
2. 调用 `di.getService(serviceId)`
3. 返回服务实例

**注意事项**：
- 服务实例是单例，不会重复创建
- 组件卸载时不需要手动清理
- 服务必须已在 App.tsx 中注册

#### 14.2.2 useServiceEvent

**位置**：`workbench/hooks/useServiceEvent.ts`

**作用**：订阅服务事件并自动更新 React State

**签名**：
```typescript
function useServiceEvent<T>(
  event: Event<T>,
  initialValue: T
): T
```

**使用示例**：
```typescript
const messages = useServiceEvent(
  chatService.onDidMessageUpdate,
  []
);
```

**内部实现**：
1. 使用 `useState` 创建状态
2. 使用 `useEffect` 订阅事件
3. 事件触发时更新状态
4. 组件卸载时自动取消订阅

**自动清理**：
- Effect cleanup 函数中调用 `dispose()`
- 防止内存泄漏

#### 14.2.3 useChatMessages

**位置**：`workbench/hooks/useChatMessages.ts`

**作用**：封装对话消息相关的逻辑

**返回值**：
```typescript
{
  messages: ChatMessage[],
  isProcessing: boolean,
  sendMessage: (input: string, options: ChatOptions) => Promise<void>,
  abort: () => void
}
```

**使用示例**：
```typescript
const {
  messages,
  isProcessing,
  sendMessage,
  abort
} = useChatMessages();

// 发送消息
await sendMessage('帮我修改标题', {
  mode: 'agent',
  modelId: 'gpt-4o'
});

// 中断生成
abort();
```

**内部实现**：
- 通过 `useService` 获取 ChatService
- 通过 `useServiceEvent` 订阅消息更新
- 封装发送和中断操作

#### 14.2.4 useConversations

**位置**：`workbench/hooks/useConversations.ts`

**作用**：管理会话列表

**返回值**：
```typescript
{
  conversations: Conversation[],
  currentConversation: Conversation | null,
  createConversation: () => Promise<string>,
  loadConversation: (id: string) => Promise<void>,
  deleteConversation: (id: string) => Promise<void>
}
```

**使用示例**：
```typescript
const {
  conversations,
  currentConversation,
  createConversation,
  loadConversation
} = useConversations();
```

#### 14.2.5 useTextAction

**位置**：`workbench/hooks/useTextAction.ts`

**作用**：封装文本操作相关逻辑

**返回值**：
```typescript
{
  isProcessing: boolean,
  performAction: (
    action: TextActionType,
    text: string,
    options?: TextActionOptions
  ) => Promise<string>
}
```

**使用示例**：
```typescript
const { performAction, isProcessing } = useTextAction();

const result = await performAction('expand', selectedText, {
  modelId: 'gpt-4o-mini'
});
```

#### 14.2.6 useStorage

**位置**：`workbench/hooks/useStorage.ts`

**作用**：简化存储操作

**签名**：
```typescript
function useStorage<T>(
  key: string,
  defaultValue: T
): [T, (value: T) => Promise<void>]
```

**使用示例**：
```typescript
const [apiKey, setApiKey] = useStorage('user.apiKey', '');
const [theme, setTheme] = useStorage('ui.theme', 'dark');

// 更新
await setApiKey('sk-...');
```

**内部实现**：
- 类似 `useState`，但持久化到 Storage
- 自动订阅存储变化事件
- 其他标签页的修改也会同步

#### 14.2.7 useUIStreamUpdates

**位置**：`workbench/hooks/useUIStreamUpdates.ts`

**作用**：处理流式 UI 更新（如思考标签、工具调用）

**返回值**：
```typescript
{
  thinking: string | null,
  isGenerating: boolean,
  progress: number
}
```

**使用示例**：
```typescript
const { thinking, isGenerating } = useUIStreamUpdates();

// 显示思考过程
{thinking && (
  <div className="thinking">
    {thinking}
  </div>
)}
```

### 14.3 DIContext 提供者

**位置**：`workbench/context/DIContext.tsx`

**作用**：
- 提供 DI 容器给所有子组件
- 确保全局只有一个 DI 实例

**使用方式**：
```typescript
// App.tsx
const di = new InstantiationService();
// ... 注册服务

return (
  <DIProvider value={di}>
    <Sidebar />
  </DIProvider>
);
```

### 14.4 自定义 Hook 开发规范

#### 14.4.1 命名规范

- 使用 `use` 前缀
- 清晰表达用途
- 例如：`useService`, `useChatMessages`

#### 14.4.2 单一职责

- 一个 Hook 只做一件事
- 复杂逻辑拆分为多个 Hook
- 可组合：大 Hook 由小 Hook 组成

#### 14.4.3 清理资源

- 使用 `useEffect` cleanup 函数
- 取消订阅
- 清理定时器
- 中断请求

#### 14.4.4 依赖数组

- 正确声明依赖
- 避免不必要的重渲染
- 使用 `useCallback` 和 `useMemo` 优化

#### 14.4.5 TypeScript 支持

- 使用泛型
- 明确的类型定义
- 避免 `any`

---

## 第五部分：开发指南

---

## 15. 标准开发流程

### 15.1 添加新的 AI 工具

**场景**：添加一个"网络搜索"工具

**步骤 1：定义工具接口（可选）**

如果需要特殊的参数类型，在 `platform/tools/ITool.ts` 中定义。

**步骤 2：实现工具类**

在 `services/agent/tools/implementations/` 创建 `WebSearchTool.ts`：

**关键点**：
- 继承 `BaseTool`
- 实现 `ITool` 接口
- 实现 `_execute()` 方法
- 设置 `needApproval` 为 `false`（只读工具）

**步骤 3：注册工具**

在 `services/agent/ToolService.ts` 的 `initializeBuiltInTools()` 中注册：

**步骤 4：测试**

- 启动 Agent 模式
- 提问需要搜索的问题
- 验证工具被正确调用

**完成**：无需修改 UI，AI 自动获得该能力

### 15.2 添加新的全局功能

**场景**：添加"会员系统"

**步骤 1：定义接口（Platform 层）**

在 `platform/auth/` 创建 `IAuthService.ts`。

**步骤 2：实现服务（Services 层）**

在 `services/auth/` 创建 `FirebaseAuthService.ts`。

**步骤 3：注册服务**

在 `workbench/parts/App.tsx` 中注册。

**步骤 4：创建 UI（Workbench 层）**

在 `workbench/parts/` 创建 `LoginPanel.tsx`。

**步骤 5：使用服务**

在组件中使用 `useService` 获取服务并调用方法。

### 15.3 添加新的 LLM 模型

**场景**：添加 Google Gemini 模型

**步骤 1：在 ModelRegistryService 中注册模型**

在 `services/llm/ModelRegistryService.ts` 的构造函数中添加。

**步骤 2：确定适配器类型**

- 如果兼容 OpenAI API：使用 `OpenAICompatibleAdapter`
- 如果完全不同：创建新的 Adapter

**步骤 3：（如需要）创建新适配器**

在 `services/llm/adapters/` 创建 `GeminiAdapter.ts`。

**步骤 4：更新 LLMProviderService**

在 `getAdapter()` 方法中添加新的 case。

**步骤 5：测试**

- 在模型选择器中选择新模型
- 发送消息测试

### 15.4 修改 UI 组件

**原则**：UI 修改不应影响 Service 层

**步骤 1：确认数据来源**

- 数据来自 Service 的事件
- 不在组件中写业务逻辑

**步骤 2：修改组件**

- 修改渲染逻辑
- 修改样式
- 保持 Service 调用不变

**步骤 3：测试**

- 验证功能正常
- 验证样式正确
- 验证响应式行为

---

## 16. 开发规范与检查清单

### 16.1 代码规范

#### 16.1.1 TypeScript

**使用严格模式**：
```json
{
  "strict": true,
  "noImplicitAny": true,
  "strictNullChecks": true
}
```

**避免 `any`**：
- 使用 `unknown` 代替
- 使用泛型
- 定义明确的类型

**使用接口而非类型别名**：
- interface 更适合定义对象形状
- type 用于联合类型、工具类型

#### 16.1.2 命名规范

**文件命名**：
- 组件：PascalCase（如 `ChatPanel.tsx`）
- 工具：camelCase（如 `utils.ts`）
- 接口文件：以 `I` 开头（如 `IEditorService.ts`）

**变量命名**：
- 普通变量：camelCase
- 常量：UPPER_SNAKE_CASE
- 私有成员：\_camelCase

**函数命名**：
- 动词开头：`getUser`, `setConfig`
- 布尔值：`isXxx`, `hasXxx`, `canXxx`
- 事件：`onDidXxx`, `onWillXxx`

#### 16.1.3 注释规范

**何时写注释**：
- 复杂算法
- 非常规做法
- API 文档
- 重要的业务逻辑

**何时不写注释**：
- 显而易见的代码
- 重复代码内容的注释

**JSDoc 注释**：
- 所有 public 方法都应该有 JSDoc
- 包含参数说明、返回值、示例

### 16.2 架构检查清单

**提交代码前，请自问：**

- [ ] **依赖方向**：我是否违反了单向依赖原则？
  - ✅ 正确：Workbench → Services → Platform → Base
  - ❌ 错误：Services 依赖 Workbench

- [ ] **依赖注入**：我是否直接实例化了服务类？
  - ✅ 正确：通过 DI 容器获取
  - ❌ 错误：`new ChatService()`

- [ ] **接口分离**：我是否先定义了接口再实现？
  - ✅ 正确：先写 `IChatService`，再写 `ChatService`
  - ❌ 错误：直接写实现类

- [ ] **生命周期**：我的服务是否正确继承了 `Disposable`？
  - ✅ 正确：实现 `dispose()` 清理资源
  - ❌ 错误：事件监听器没有清理

- [ ] **UI 逻辑分离**：我是否在 UI 组件中写了业务逻辑？
  - ✅ 正确：业务逻辑在 Service，UI 只展示
  - ❌ 错误：在组件中直接调用 API

- [ ] **工具实现**：我的工具是否通过 `IEditorService` 操作？
  - ✅ 正确：依赖接口，不直接操作 DOM
  - ❌ 错误：直接 `document.querySelector`

- [ ] **服务注册**：我是否正确注册了服务？
  - ✅ 正确：使用 `ServiceDescriptor`，声明依赖
  - ❌ 错误：忘记注册或顺序错误

- [ ] **循环依赖**：我是否创造了循环依赖？
  - ✅ 正确：A → B → C（单向）
  - ❌ 错误：A → B → A（循环）

- [ ] **单一职责**：我的服务是否超过 500 行？
  - ✅ 正确：职责单一，代码精简
  - ❌ 错误：上帝类，包含多个职责

- [ ] **适配器模式**：我是否正确使用了适配器？
  - ✅ 正确：新增厂商创建新 Adapter
  - ❌ 错误：在 LLMService 中写 if-else

### 16.3 Git 规范

#### 16.3.1 提交信息

**格式**：
```
<type>(<scope>): <subject>

<body>

<footer>
```

**type 类型**：
- `feat`: 新功能
- `fix`: 修复 Bug
- `refactor`: 重构
- `docs`: 文档
- `style`: 代码格式
- `test`: 测试
- `chore`: 构建/工具

**示例**：
```
feat(tools): 添加网络搜索工具

- 实现 WebSearchTool 类
- 集成 Google Search API
- 添加搜索结果渲染器

Closes #123
```

#### 16.3.2 分支策略

- `main`: 生产分支，受保护
- `develop`: 开发分支
- `feature/xxx`: 功能分支
- `fix/xxx`: 修复分支
- `refactor/xxx`: 重构分支

---

## 17. 常见问题与解决方案

### 17.1 依赖注入相关

**Q: 服务实例化失败，提示"循环依赖"**

A: 检查服务的依赖关系，确保没有 A → B → A 的情况。解决方案：
- 重新设计服务职责
- 使用事件机制代替直接依赖
- 拆分服务

**Q: `useService` 返回 undefined**

A: 服务未注册或注册顺序错误。解决方案：
- 检查 App.tsx 中是否注册了该服务
- 检查注册顺序（被依赖的服务要先注册）
- 检查 ServiceIdentifier 是否正确

### 17.2 RPC 通信相关

**Q: RPC 调用超时**

A: Content Script 可能未加载或通道未建立。解决方案：
- 检查 manifest.json 中的 content_scripts 配置
- 检查页面是否匹配 URL 规则
- 使用 `chrome.scripting.executeScript` 强制注入

**Q: RPC 调用返回错误"方法未注册"**

A: 服务端未注册该方法。解决方案：
- 检查 Content Script 中的 RPCServer 注册
- 确认方法名拼写正确
- 查看 Console 日志

### 17.3 编辑器桥接相关

**Q: 无法获取 EditorView**

A: overleafBridge.js 未正确注入或 Overleaf 页面结构变化。解决方案：
- 检查 manifest.json 中的 web_accessible_resources
- 检查注入脚本的时机
- 查看 Overleaf 页面结构是否变化

**Q: 搜索功能返回旧内容**

A: 当前编辑器内容未优先使用。解决方案：
- 确认 overleafBridge.js 中优先使用 EditorView 内容
- 检查 blob API 是否返回最新 hash

### 17.4 LLM 调用相关

**Q: 流式响应中断**

A: 网络问题或 LLM 服务端问题。解决方案：
- 检查网络连接
- 检查 API Key 是否有效
- 查看是否触发速率限制
- 检查模型是否支持

**Q: 工具调用失败**

A: 参数解析错误或工具执行错误。解决方案：
- 检查 JSON Schema 定义是否正确
- 检查 LLM 生成的参数格式
- 查看工具执行日志
- 添加参数验证

### 17.5 性能相关

**Q: UI 渲染卡顿**

A: 消息列表过长或频繁更新。解决方案：
- 使用虚拟滚动（react-window）
- 限制历史消息数量
- 优化 Markdown 渲染
- 使用 `React.memo` 避免不必要的重渲染

**Q: 内存占用过高**

A: 事件监听器未清理或消息历史过多。解决方案：
- 检查所有 `useEffect` 是否有 cleanup
- 定期清理旧会话
- 限制单次请求的上下文长度
- 使用 Chrome DevTools 分析内存泄漏

---

## 附录

### A. 核心口号

> "所有的 UI 都是暂时的，所有的接口才是永恒的。"

> "单一职责，职责分离。一个服务只做一件事。"

> "依赖抽象，不依赖实现。依赖 Interface，不依赖 Class。"

### B. 推荐阅读

- [VS Code Architecture](https://github.com/microsoft/vscode/wiki/Source-Code-Organization)
- [Dependency Injection in TypeScript](https://inversify.io/)
- [Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- [React Hooks Best Practices](https://react.dev/learn)

### C. 联系方式

如有疑问或建议，请：
- 提交 Issue
- 发起 Pull Request
- 联系维护者

---

**文档结束**

编写代码时，请想象 UI 可能会被完全重写，但你的 Service 逻辑应该不需要改动。

这就是好的架构设计。
