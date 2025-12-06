# Overleaf AI Assistant 浏览器插件项目报告

## 一、项目整体功能与定位

- **项目名称**：Overleaf AI Assistant（浏览器插件）
- **技术栈**：TypeScript + React 18 + Vite + Chrome Extension (Manifest v3) + 自研 DI 容器 + 自研 RPC 系统
- **运行位置**：作为浏览器扩展，在 Overleaf 页面中注入 Content Script，并在 Sidepanel / Popup 中挂载 React 应用。

### 1.1 目标与核心能力

- **为 Overleaf 用户提供 AI 助手能力**，主要围绕：
  - 智能对话（Chat / Agent / Normal 三种模式）
  - 对 LaTeX 文档进行理解、搜索、重构与编辑
  - 基于项目内容进行上下文感知回答
- **Agent 工具系统（Tools）**：
  - 提供 `read_file`、`edit_code`、`search_content`、`list_files` 等工具
  - 工具由 LLM 通过“Tool Calling / Function Calling”自动调用
  - 对敏感操作（如编辑代码）引入 **用户审批流程**
- **多模型支持与能力建模**：
  - 通过 `ModelRegistryService` 管理不同厂商（OpenAI、Anthropic、Gemini、自建等）模型的能力与默认配置
  - 统一抽象为 `ILLMService`，屏蔽 SDK / 协议差异
- **跨上下文通信**：
  - Sidepanel React UI 不能直接操作 Overleaf DOM
  - 通过自研 **RPC 系统** 在 Sidepanel ↔ Content Script 之间转发操作（如读取/编辑 Overleaf 文本）
- **本地存储与配置管理**：
  - 通过 `StorageService` 封装 Chrome Storage
  - 提供类型安全、事件驱动的键值存储，并集成 React Hooks（`useStorage` 等）

### 1.2 架构总体思想

项目整体架构深度参考 VS Code 的“微内核 + 服务 + 工作台”模式：

- **严格分层**：Base → Platform → Services → Workbench → Extension
- **依赖注入（DI）**：所有业务逻辑都通过 Service 形式注册到 DI 容器，由 UI 使用 `useService` 获取
- **接口分离**：
  - `platform/` 只存放接口与类型定义（“做什么”）
  - `services/` 实现具体逻辑（“怎么做”）
  - `workbench/` 只依赖接口，不依赖具体实现
- **生命周期管理**：
  - 大部分长生命周期对象继承 `Disposable`
  - 通过统一的 `dispose()` 清理事件、定时器等资源

---

## 二、仓库顶层结构

仓库根目录（`overleaf-Cursor/`）：

- **`ARCHITECTURE.md`**
  - 架构“圣经”，定义：分层结构、依赖规则、Agent/LLM/Tools 的设计原则
  - 包括 2024 年后 Agent 系统重构说明（从上帝类 ChatService 拆分为 ChatService + AgentService + LLMProviderService 等）

- **`RPC_IMPLEMENTATION.md`**
  - RPC 通信系统的设计与实现报告
  - 描述 Sidepanel ↔ Content Script 的调用流程与相关文件位置

- **`STORAGE_IMPLEMENTATION.md`**
  - Storage Service 的分层实现说明及使用指南
  - 详细介绍 `IStorageService`、适配器、React Hooks 的用法

- **`REACT_HOOKS_IMPLEMENTATION.md`**
  - React Service Hooks 系统的设计报告
  - 说明 `DIProvider`、`useService`、`useServiceEvent` 等 Hook 的实现与最佳实践

- **`开发日志.md`**
  - 简要记录阶段性进展（DI 容器、React Hooks、RPC、Storage Service 已完成等）

- **`overleaf-ai-react/`**
  - 实际 Chrome 插件 React 工程（Vite 项目），后文详细展开

---

## 三、`overleaf-ai-react/` 项目结构

`overleaf-ai-react/` 是一个使用 Vite 的 React + TypeScript 浏览器扩展项目。

### 3.1 顶层文件

- **`package.json`**
  - 主要依赖：`react`、`react-dom`、`vite`、`@crxjs/vite-plugin`、`typescript` 等
  - 脚本：`dev`（本地开发）、`build`（打包扩展）

- **`manifest.config.ts`**
  - 使用 `@crxjs/vite-plugin` 生成 Chrome Extension Manifest
  - 配置 content scripts、sidepanel、popup、权限（如 `storage`、`scripting` 等）

- **`vite.config.ts` / `tsconfig*.json`**
  - Vite 构建配置（含 CRX 插件）
  - TypeScript 编译配置

- **`dist/`**
  - 构建产物目录（打包之后的扩展文件）

- **`scripts/`**
  - 构建辅助脚本，如图标转换脚本 `convert-icons.js` 等

- **`src/`**
  - **核心源码目录**，遵循 Base → Platform → Services → Workbench → Extension 分层，下面展开

---

## 四、`src/` 分层架构与各目录职责

### 4.1 `src/base/` — 基础设施层（L1）

- **定位**：
  - 提供与业务无关的通用工具和基础设施（类似 `lodash` + mini runtime），不依赖更高层。
  - 严禁导入 `platform/`、`services/` 或 `workbench/` 中的代码。

- **结构**：
  - `src/base/common/`
    - 事件系统、Disposable 基类、类型工具等。
    - 示例：`event.ts`（Emitter）、`lifecyle.ts`（Disposable）等。
  - `src/base/browser/`
    - 浏览器相关基础封装
    - 例如 `storage.ts` 中：
      - `StorageScope`（LOCAL/SYNC/SESSION）
      - `IStorageAdapter` / `ChromeStorageAdapter` / `InMemoryStorageAdapter`

- **在项目中的作用**：
  - 为 RPC、Storage、DI、LLM 等上层系统提供抽象的基础能力。
  - 例如：RPCChannel 实现、事件发射器、UUID 生成等。

### 4.2 `src/platform/` — 接口契约层（L2）

- **定位**：
  - 只定义接口、类型和 Service Identifier（Symbol）。
  - 描述“系统能干什么”，不关心“怎么实现”。

- **关键子目录**：
  - `platform/instantiation/`
    - DI 核心：`InstantiationService`、`ServiceDescriptor`、`@injectable` 等
  - `platform/editor/`
    - `IEditorService` 接口（操作 Overleaf 编辑器，如获取当前文件名、读取全文、应用编辑等）
  - `platform/agent/`
    - `IAgentService.ts`：定义 Agent 编排服务接口、AgentLoop 状态、控制器等
    - `IChatService.ts`：定义对话层接口（sendMessage / abort / approveToolCall 等）
    - `IPromptService.ts`：负责构建 LLM 消息（system + history + context + tools）
    - `IToolService.ts`：工具注册与执行接口，定义 `ITool` 结构
    - `IUIStreamService.ts`：与 UI 流式展示相关的接口
    - `agent.ts`：早期/简化版代理接口（`AgentMessage` / `ToolCall` 等）
  - `platform/llm/`
    - `ILLMService.ts`：抽象底层 LLM 调用
    - `IModelRegistryService.ts`：抽象模型能力/默认配置的注册表
  - `platform/rpc/`
    - `rpc.ts`：`RPCRequest`、`RPCResponse`、`IRPCChannel`、`IRPCClient`、`IRPCServer` 等接口
  - `platform/storage/`
    - `storage.ts`：`IStorageService` + `IStorageServiceId` + `StorageChangeEvent`
  - `platform/tools/`
    - 描述工具的公共类型，如 `ToolResult` 等

- **在项目中的作用**：
  - 所有上层（Services、Workbench）只能依赖这些接口进行交互。
  - 新增功能时，必须优先在 Platform 层增加接口，再去实现。

### 4.3 `src/services/` — 业务实现层（L3）

- **定位**：
  - Platform 层接口的具体实现，是“业务大脑”。
  - 包括 Agent 编排、LLM 调用、RPC 客户端/服务端、存储实现等。

- **子目录与职责**：

  - **`services/agent/`**
    - `AgentService.ts`
      - 实现 `IAgentService`，负责 **Agent Loop 编排**：
        - 维护多轮 Agent Loop 状态（`LoopContext`）
        - 调用 `PromptService` 组装消息
        - 调用 `LLMService` 发起流式请求，解析工具调用（tool_calls）
        - 根据模型能力和模式（agent/chat/normal）选择工具集合
        - 管理工具审批：
          - 对 `needApproval = true` 的工具触发 `ToolCallPendingEvent`
          - 等待 UI 用户批准后再真正调用 `ToolService.executeTool`
      - 同时管理 LLM 请求的中断（`AbortController`）等。

    - `ChatService.ts`
      - 实现 `IChatService`，面向 UI：
        - 管理对话消息列表 `_messages`
        - 维护当前是否在处理中 `_isProcessing`
        - 将用户输入封装后调用 `AgentService.execute(...)`
        - 将 Agent 产生的消息通过事件 `onDidMessageUpdate` 推送给 React UI
        - 管理 `approveToolCall` / `rejectToolCall` 接口

    - `PromptService.ts`
      - 实现 `IPromptService`：
        - 根据模式（agent/chat/normal）选择不同 System Prompt 模板
        - 通过 `IEditorService` 读取上下文文件/选中片段
        - 按模型能力（来自 `IModelRegistryService`）做历史截断、tools 注入等

    - `ToolService.ts`
      - 实现 `IToolService`：
        - 内部维护 `Map<string, ITool>` 注册表
        - 提供工具查询、按类型筛选、只读工具列表等
        - 执行工具时统一打点：耗时、错误日志
        - 初始化内置工具：
          - `read_file`（读取 Overleaf 文件内容）
          - `edit_code`（编辑 LaTeX/代码，需审批）
          - `search_content`（项目内搜索）
          - `list_files`（列出项目文件）

    - `UIStreamService.ts`
      - 与 UI 展示流式内容有关（例如 `thinking` / 内容拆分等），解耦 LLM 增量数据和前端渲染。

  - **`services/llm/`**
    - `LLMService.ts`
      - 实现 `ILLMService`：
        - 统一封装流式请求接口 `streamResponse`
        - 负责管理 token 流事件、错误处理、取消逻辑
    - `ModelRegistryService.ts`
      - 实现 `IModelRegistryService`：
        - 静态注册表，描述各模型能力 `ModelCapabilities` 和默认配置 `ModelConfig`
        - 提供 `getCapabilities` / `getDefaultConfig` / `listModels`
    - `adapters/`
      - 针对不同厂商 SDK 的适配器：
        - 如 `OpenAIProvider.ts`、`AnthropicProvider.ts`、`GeminiProvider.ts`、`OpenAICompatibleProvider.ts` 等
      - 将统一的 `LLMConfig` 转换为对应 HTTP 请求/SDK 调用参数

  - **`services/editor/`**
    - `OverleafEditorService.ts`
      - Content Script 端实际 DOM 操作实现（读取内容、应用编辑等）
    - `EditorServiceProxy.ts`
      - Sidepanel 端代理，实现 `IEditorService`，内部通过 RPC 调用 Content Script

  - **`services/rpc/`**
    - `RPCClient.ts` / `RPCServer.ts` / `example.ts`
      - 客户端：发送请求 + 等待响应，支持超时、请求 ID 管理
      - 服务端：注册方法 + 分发调用
      - 与 Base 层 `ChromeRuntimeChannel`/`ChromeTabChannel`/`WindowMessageChannel` 组合使用

  - **`services/storage/`**
    - `StorageService.ts`
      - Content Script 端使用 `ChromeStorageAdapter` 操作 Chrome Storage
      - 提供 `get/set/remove/clear/keys/getByPrefix/has` 等方法
      - 发射 `onDidChangeStorage` 事件
    - `StorageServiceProxy.ts`
      - Sidepanel 端代理，通过 RPC 与 Content Script 中的 StorageService 通信

  - **`services/configuration/` 等**
    - 提供配置读写服务（可能与 Storage 结合），为模型选择、开关、用户偏好等提供支持。

### 4.4 `src/workbench/` — UI 工作台层（L4）

- **定位**：
  - React UI，只负责编排视图与用户交互，不直接写业务逻辑 / 调用 HTTP / 操作 DOM。
  - 所有业务操作统一通过 Hooks 调用 Service。

- **结构**：
  - `workbench/context/DIContext.tsx`
    - 定义 `DIContext` / `DIProvider` / `useDIContainer`
    - 在入口处使用 `<DIProvider container={di}> <App /> </DIProvider>` 提供 DI 容器
  - `workbench/hooks/`
    - `useService`：从 DI 容器获取某个 Service 实例
    - `useServiceEvent` / `useServiceEventWithCallback` / `useServiceEventArray`：订阅 Service 事件并同步到 React State
    - `useStorage` / `useStorageValue` / `useStorageByPrefix`：基于 `IStorageService` 的持久化 Hook
    - 其他封装型 Hook（如 `useCurrentFile`、`useUserProfile` 等）
  - `workbench/parts/`
    - `App.tsx`
      - 顶层 UI 容器，拼装各个 Panel（如聊天面板、设置面板、存储示例面板等）
    - 其他 UI 部分（如 Chat 面板、配置面板等），遵循：
      - 使用 `useService<IChatService>(IChatServiceId)` 访问聊天服务
      - 使用 `useServiceEvent` 订阅消息更新、工具审批事件
      - 在 UI 上渲染 user / assistant / tool 消息列表；提供输入框、模型选择、模式切换等
  - `workbench/styles/`
    - 全局样式、组件样式（可能使用 Tailwind 或传统 CSS/SCSS）
  - `workbench/types/`
    - UI 层专用的类型定义（如某些视图模型）

### 4.5 `src/extension/` — 浏览器扩展入口层

- **定位**：
  - 真正与 Chrome Extension 交互的入口：Content Script / Options / Popup / Sidepanel 等。

- **结构**：
  - `extension/content/`
    - Content Script 入口文件（如 `main.tsx`）：
      - 创建 DI 容器
      - 注册实际实现类（如 `OverleafEditorService`、`StorageService`、`RPCServer`）
      - 挂载/注入必要的 DOM 节点（如果需要）
  - `extension/popup/`
    - 浏览器工具栏弹出页面入口（`popup.html` + `popup/main.tsx`）
    - 可以简单展示状态、快捷开关等
  - `extension/options/`
    - 扩展配置页面入口，可能用于高级设置（如模型 Key、默认模型、日志级别等）

---

## 五、整体架构流程概览

### 5.1 聊天与 Agent 调用流程（简化版）

1. **用户在 Sidepanel 中输入问题并点击发送**：
   - `workbench/parts/App.tsx`（或 Chat 面板）通过 `useService(IChatServiceId)` 获取 `chatService`，调用：
     - `chatService.sendMessage(input, { mode, modelId, contextItems, ... })`

2. **ChatService 处理用户输入**：
   - 在内存中追加一条 `user` 消息
   - 触发 `onDidMessageUpdate` 事件 → React UI 更新列表
   - 调用 `AgentService.execute(messages, options)` 启动 Agent Loop

3. **AgentService 启动 Agent Loop**：
   - 调用 `PromptService.constructMessages(...)` 构建 `LLMMessage[]`
     - `PromptService` 通过 `IEditorService` / `IStorageService` 获取上下文
   - 根据模型 `ModelCapabilities` 和对话模式，决定 `ToolService` 提供的工具集合
   - 调用 `LLMService.streamResponse(messages, llmConfig)` 发起流式请求

4. **LLM 流式返回**：
   - 每个 token / step 通过 `onToken` 事件回到 `AgentService`
   - `AgentService` 更新当前轮 `assistant` 消息的 `thinking` / 可见 `content`
   - 触发 `onUpdate` → ChatService → `onDidMessageUpdate` → UI 实时更新

5. **Tool Calling 与审批**：
   - LLM 最终消息中如包含 `tool_calls`：
     - `AgentService` 根据 tool 名称查询 `ToolService` 中的元信息
     - 对只读工具（`needApproval = false`）自动执行，并将结果作为 `tool` 消息加入上下文，再进入下一轮 LLM 调用
     - 对编辑类工具（`edit_code` 等）创建 `PendingToolCall`：
       - 触发 `ToolCallPendingEvent` → ChatService → UI 渲染“AI 想修改 xxx，是否允许？”
   - 用户在 UI 中点击“允许/拒绝”：
     - 调用 `chatService.approveToolCall(id)` 或 `rejectToolCall(id)`
     - 最终由 `AgentService` 调 `ToolService.executeTool`，并继续 Agent Loop

6. **结束与持久化**：
   - 当本轮对话完成且不再有工具调用时：
     - `AgentService` 标记 loop 结束
     - ChatService 可选通过 `ConversationStoreService` 将对话记录（不含 thinking）持久化到 Storage

### 5.2 RPC 与 Storage 流程

- **RPC**：
  - Sidepanel 端的 `EditorServiceProxy` / `StorageServiceProxy` 等通过 `RPCClient` 向 Content Script 的 `RPCServer` 发送请求
  - Content Script 端注册真实 `OverleafEditorService` / `StorageService` 的方法
  - 这样，UI 层和业务服务可以“像本地调用一样”操作 Overleaf DOM 和存储

- **Storage**：
  - 服务层统一通过 `IStorageService` API 读写配置
  - Workbench 层通过 `useStorage` 系列 Hook 与 UI 状态绑定，实现自动同步

---

## 六、设计原则与约束总结

### 6.1 四大铁律（来自 ARCHITECTURE.md）

- **单向依赖（Strict Layering）**
  - 依赖方向：Workbench → Services → Platform → Base
  - 禁止反向引用和循环依赖

- **依赖注入（Dependency Injection）**
  - 禁止在 React 组件或普通代码中直接 `new` 业务类
  - 所有服务都通过 DI 容器管理，并用 `@injectable(...deps)` 声明依赖

- **接口分离（Interface Separation）**
  - 先在 `platform/` 定义接口
  - 再在 `services/` 实现
  - UI 只能依赖接口，不关心具体实现（可用 proxy / mock 等）

- **生命周期管理（Disposable Pattern）**
  - 包含事件监听、定时器、DOM 绑定的类必须实现 `dispose()`
  - 通过基类 `Disposable` 统一管理资源释放

### 6.2 React 使用规范

- 组件必须：
  - 通过 `useService(IServiceId)` 获取服务
  - 通过 `useServiceEvent` 等 Hook 订阅服务事件
  - 不允许在组件中直接发 HTTP 或操作 DOM（这些逻辑应放在 Services 中）

### 6.3 Agent / LLM 相关原则

- Agent 逻辑集中在 `AgentService`，ChatService 仅负责对话状态与事件转发
- LLM 调用必须通过 `ILLMService` 和 `ModelRegistryService`，避免散落的模型常量
- 工具体系：
  - 每个工具是一个实现 `ITool` 接口的独立对象（未来可以拆到 `services/agent/tools/` 单文件）
  - 工具要么只读，要么写入；写入必须支持用户审批

### 6.4 扩展与维护建议

- 新增功能流程建议：
  - 在 `platform/` 先定义 Service 接口
  - 在 `services/` 实现服务类，并通过 DI 注册
  - 在 `workbench/` 使用 `useService` + Hook 连接 UI

- 新增模型 / LLM 供应商：
  - 在 `ModelRegistryService` 中注册能力与默认配置
  - 在 `services/llm/adapters/` 中新增 Provider，实现统一接口

- 新增工具（Tool）：
  - 在 `ToolService.initializeBuiltInTools` 中注册，或拆分为独立工具类
  - 根据是否需要审批设置 `needApproval`

---

## 七、小结

这个项目已经搭建起完整的“Overleaf AI 助手”微内核架构：

- 分层清晰：Base / Platform / Services / Workbench / Extension 各司其职
- 通信完备：Sidepanel ↔ Content Script 通过 RPC 透明交互
- 能力强大：支持多厂商 LLM、工具调用、用户审批、本地存储
- UI 解耦：React 组件只依赖接口与事件，通过 Hooks 与服务交互

后续主要工作可以集中在：

- 丰富 Agent 工具（如重构、诊断、文献搜索等）
- 完善 Chat UI 与模型/模式选择体验
- 增强配置管理（API Key、限额、日志）
- 引入更完善的日志与监控（基于 LogService 和 Storage/RPC）
