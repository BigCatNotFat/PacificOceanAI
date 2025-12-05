Overleaf AI Assistant - 架构开发指南与核心规范（！！！下面的内容不许任何人更改！！！！）

本文档是 "Overleaf AI Assistant" 浏览器的插件开发圣经。所有代码提交必须严格遵守本文档定义的架构原则、目录结构和代码模式。

1. 核心设计哲学 (Core Philosophy)

本项目借鉴 VS Code 的微内核架构思想，旨在构建一个高内聚、低耦合、易于扩展的浏览器插件。

四大铁律

单向依赖 (Strict Layering)：

架构层级：Workbench (UI) > Services (Logic) > Platform (Interfaces) > Base (Utils)。

原则：上层只能依赖下层，下层绝对不能引用上层。禁止循环依赖。

依赖注入 (Dependency Injection - DI)：

禁止在组件中直接实例化业务类（new Class()）。

所有功能封装为服务 (Service)。

通过接口 (Interface) 声明依赖，由 DI 容器自动注入。

DI 系统核心组件：
  - ServiceIdentifier<T>：服务的唯一标识符（Symbol）
  - ServiceCollection：存储服务实例的容器
  - ServiceDescriptor：描述如何创建服务（构造函数 + 依赖列表）
  - InstantiationService：DI 容器核心，自动解析并注入依赖
  - @injectable(...deps)：装饰器，声明类的构造函数依赖

接口分离 (Interface Separation)：

先定义“做什么”（Interface，存放在 platform/）。

再实现“怎么做”（Implementation，存放在 services/）。

UI 层只引用 Interface，绝不引用 Service 具体类。

生命周期管理 (Disposable Pattern)：

所有包含事件监听、定时器、DOM 绑定的类，必须继承 Disposable 基类。

必须实现 dispose() 方法以清理资源，防止内存泄漏。

1. 目录结构规范 (Directory Structure)

src/
├── base/                   # [L1] 基础库 (严禁包含业务逻辑)
│   ├── common/             # 通用工具 (Event, Disposable, UUID, URI)
│   └── browser/            # 浏览器API封装 (Storage, DOM Utils)
│   └── ...                 # 其他工具
│
├── platform/               # [L2] 接口定义层 (只定义 Interface 和 DI 标识符)
│   ├── editor/             # IEditorService.ts
│   ├── auth/               # IAuthService.ts
│   ├── agent/              # IAgentService.ts
│   ├── tools/              # ITool.ts (AI 工具标准接口)
│   ├── instantiation/      # DI 容器核心代码 (ServiceCollection)
│   └── configuration/      # IConfigurationService.ts
│   └── ...                 # 其他接口
│
├── services/               # [L3] 业务实现层 (具体的逻辑代码)
│   ├── editor/             # OverleafEditorService.ts (DOM 操作/RPC 调用)
│   ├── auth/               # FirebaseAuthService.ts
│   ├── agent/              # AgentService.ts (LLM 调用核心)
│   │   └── tools/          # 具体工具实现 (如 ReadFileTool.ts, WebSearchTool.ts)
│   └── log/                # LogService.ts
│   └── ...                 # 其他服务
│
├── workbench/              # [L4] UI 表现层 (React 组件)
│   ├── parts/              # 具体功能面板 (ChatPanel, LoginPanel)
│   ├── common/             # 通用 UI 组件 (Button, Input)
│   └── hooks/              # useService.ts (连接 React 与 Service 层的桥梁)
│   └── ...                 # 其他组件
│
└── extension/              # [Entry] 插件入口
    ├── content/            # Content Script (注入页面，负责 DOM 操作)
    ├── background/         # Service Worker (负责跨域请求、长连接)
    ├── sidepanel/          # Sidepanel HTML (React App 挂载点)
    └── popup/              # Popup HTML

3. 开发层级详解 (Layer Guidelines)
Level 1: Base (地基)
职责：提供像 lodash 或 utils 一样的通用能力。

规则：

严禁导入 platform、services 或 workbench 中的代码。

包含：事件发射器 (Emitter)、生命周期 (Disposable)、异步队列、类型检测。

Level 2: Platform (契约)
职责：定义系统的“骨架”。这里只有 .ts 类型定义和接口。

规则：

只定义 interface 和 DI 的装饰器（Decorator）。

严禁包含具体的业务逻辑实现。

如果需要修改核心能力（如增加登录），先在这里定义 IAuthService。

Level 3: Services (核心)
职责：系统的“肌肉”。实现 Platform 中定义的接口。

规则：

可以依赖 Platform 和 Base。

Agent 开发原则：

每个 AI 工具（Tool）应作为一个独立的类放在 services/agent/tools/ 下。

工具类应实现 ITool 接口。

工具类通过注入 IEditorService 来操作文件，不直接操作 DOM。

Level 4: Workbench (皮肤)
职责：React UI 界面。

规则：

严禁在 React 组件中写复杂的业务逻辑（如直接调用 OpenAI API）。

组件只能通过 useService() 获取服务实例，并调用其方法。

状态同步：不要手动轮询，应通过 service.onDidXxx 事件来更新 React State。

React Hooks 系统：
  - DIProvider：在应用根部提供 DI 容器
  - useService(serviceId)：获取服务实例
  - useServiceEvent(event, initialValue)：自动订阅服务事件并更新 State
  - useServiceEventWithCallback(event, callback)：订阅事件并执行回调
  - useServiceEventArray(event, maxLength)：累积事件值到数组

React 组件使用服务的标准模式：
```typescript
function MyComponent() {
  // 1. 获取服务实例
  const editorService = useService<IEditorService>(IEditorServiceId);
  
  // 2. 自动订阅事件（组件卸载时自动取消订阅）
  const currentFile = useServiceEvent(
    editorService.onDidChangeActiveFile,
    null
  );
  
  // 3. 调用服务方法
  const loadContent = async () => {
    const text = await editorService.getEditorFullText();
  };
  
  return <div>{currentFile}</div>;
}
```

4. 标准开发流程 (Standard Workflows)
场景 A：添加一个新的 AI 工具 (如“网络搜索”)
定义参数：在 services/agent/tools/ 下新建 WebSearchTool.ts。

实现逻辑：让类实现 ITool 接口。

id: "web_search"

execute(args): 调用 Google Search API。

注册工具：在 AgentService.ts 的 registerTools() 方法中实例化该工具。

完成：无需修改 UI，AI 自动获得该能力。

场景 B：添加一个新的全局功能 (如“会员系统”)
L2 (Platform)：在 platform/auth/ 定义 IAuthService，包含 isPro 属性和 login() 方法。

L3 (Services)：在 services/auth/ 实现 FirebaseAuthService。

注册服务：在项目入口处（extension/sidepanel/index.ts），将实现类注册到 DI 容器中。

L4 (Workbench)：创建 LoginPanel.tsx，通过 useService(IAuthService) 调用登录方法。

场景 C：使用依赖注入 (DI) 的完整流程
步骤 1 - 定义服务接口 (platform/)：
```typescript
// platform/log/log.ts
export interface ILogService {
  log(message: string): void;
}
export const ILogServiceId = Symbol('ILogService');
```

步骤 2 - 实现服务类 (services/)：
```typescript
// services/log/LogService.ts
import { injectable } from '../../platform/instantiation';
import type { ILogService } from '../../platform/log/log';

@injectable() // 声明无依赖
export class LogService implements ILogService {
  log(message: string): void {
    console.log(`[LOG] ${message}`);
  }
}
```

步骤 3 - 注册服务 (入口文件)：
```typescript
// extension/content/main.tsx
import { InstantiationService, ServiceDescriptor } from '../../platform/instantiation';
import { ILogServiceId } from '../../platform/log/log';
import { LogService } from '../../services/log/LogService';

const di = new InstantiationService();
di.registerDescriptor(new ServiceDescriptor(ILogServiceId, LogService));

// 获取服务
const logService = di.getService<ILogService>(ILogServiceId);
logService.log('Hello World');
```

步骤 4 - 带依赖的服务：
```typescript
// services/config/ConfigService.ts
import { injectable } from '../../platform/instantiation';
import { ILogServiceId, type ILogService } from '../../platform/log/log';

@injectable(ILogServiceId) // 声明依赖 ILogService
export class ConfigService {
  constructor(private readonly logService: ILogService) {}
  
  get(key: string): string {
    this.logService.log(`Getting config: ${key}`);
    return 'value';
  }
}
```

5. 浏览器插件特殊通信规约 (RPC Protocol)
由于 Chrome 插件的隔离性（Sidepanel 无法直接操作 Overleaf 页面的 DOM），必须遵守以下通信规约：

UI 层 (Sidepanel)：运行 Service 的代理 (Proxy) 或 客户端 (Client)。

页面层 (Content Script)：运行 Service 的宿主 (Host) 或 服务端 (Server)。

桥接 (Bridge)：

当 Agent 需要"读取文件"时，Sidepanel 发送消息 -> Background 转发 -> Content Script 执行 DOM 操作 -> 返回结果。

建议在 services/editor/ 中封装这层 RPC 逻辑，对上层 Agent 透明。

RPC 系统架构：
  - IRPCChannel：消息通道抽象（ChromeRuntimeChannel / ChromeTabChannel / WindowMessageChannel）
  - RPCServer：服务端，注册并处理方法调用（Content Script 中使用）
  - RPCClient：客户端，发送请求并等待响应（Sidepanel 中使用）
  - EditorServiceProxy：EditorService 的 RPC 代理实现

RPC 通信流程：
  1. Content Script 创建 RPCServer 并注册 OverleafEditorService
  2. Sidepanel 创建 RPCClient 和 EditorServiceProxy
  3. Sidepanel 调用 editorService.getCurrentFileName()
  4. EditorServiceProxy 通过 RPCClient 发送 RPC 请求
  5. Content Script 的 RPCServer 接收请求并调用真实的 OverleafEditorService
  6. 结果通过 RPC 响应返回给 Sidepanel
  7. EditorServiceProxy 返回 Promise resolve 结果




核心原则：UI (Workbench) 只负责展示和触发，Service (Services) 负责所有状态流转和逻辑，Platform 负责定义接口契约。

---
1. Base 层
文件路径： src/base/common/llm/modelCapabilities.ts
这一层只做“类型地基”，不包含任何具体业务或模型配置。
职责
1. 类型定义 (Type Definitions)
 规定“模型能力”相关的所有基础类型，例如：
  - ModelId：模型标识（如 "gpt-5.1" | "deepseek-chat" | "gemini-2.5-pro"）。
  - ModelCapabilities：描述模型能力的结构，例如：
    - supportsTools: boolean（是否支持工具调用）
    - supportsReasoning: boolean（是否支持思考/推理标签）
    - maxContextTokens: number（最大上下文长度）
    - maxOutputTokens: number
    - supportsVision: boolean
    - supportsSystemPrompt: boolean
    - 等等。
  - ModelConfig：调用模型时可配置的参数结构（温度、top_p、max_tokens 等）。
2. 约束
  - Base 层只放类型定义，不再存放任何静态模型注册表。
  - 不允许在此处硬编码 “GPT-4 / Claude / Gemini” 的具体配置，也不允许有任何网络调用或业务逻辑。
静态注册表位置调整（重要变更）
- 新增 Platform 层接口：platform/llm/IModelRegistryService.ts
  - 定义 IModelRegistryService 接口和 IModelRegistryServiceId：
    - getCapabilities(modelId: ModelId): ModelCapabilities
    - getDefaultConfig(modelId: ModelId): ModelConfig
    - listModels(): ModelId[]
- 新增 Services 实现层：services/llm/ModelRegistryService.ts
  - 实现 IModelRegistryService，在内部以静态表的形式硬编码各个模型（GPT-4、Claude-3.5、Gemini 等）的能力与默认配置。
- 依赖关系：
  - ChatService / PromptService / LLMService 如果需要了解模型能力或默认参数，必须通过 IModelRegistryService 获取，而不是直接依赖静态常量。

---
2. Platform 层 (L2 - 接口契约)
这一层定义“做什么”，不关心“怎么做”。对于当前对话编排体系，我们主要有三个核心服务接口：

---
2.1 文件：platform/agent/IChatService.ts
作用：
 核心编排服务，对外暴露对话的主要操作（发送、停止、审批）。UI 只接触这个接口，不直接操作 LLM 或工具。
ServiceIdentifier： IChatServiceId
接口定义：
- sendMessage(input: string, options: ChatOptions): Promise<void>
  - 参数：
    - input：用户输入的自然语言问题。
    - options: ChatOptions：
      - modelId / modelSelection：选中的模型。
      - mode: ChatMode：agent | chat | normal。
      - contextItems: ContextItem[]：选中的文件、代码片段、额外上下文。
      - conversationId?: string：可选，会话 ID（用于未来多会话支持）。
  - 作用：
 UI 点击发送时调用。该方法不直接返回回答内容，而是启动一个异步流程，通过事件把对话状态推给 UI。
- abort(): void
  - 作用：
 中断当前正在进行的 LLM 流式生成。
- approveToolCall(toolCallId: string): Promise<void>
  - 作用：
 当工具调用需要用户审批（如修改代码）时，UI 调用此方法通知 Service 继续执行该工具调用。
- rejectToolCall(toolCallId: string): Promise<void>
  - 作用：
 用户拒绝工具调用时，由 UI 触发。Service 将中止该工具调用并更新消息状态。
- onDidMessageUpdate: Event<ChatMessage[]>
  - 作用：
 对话消息列表更新事件：
    - 新的 user/assistant/tool 消息产生时触发。
    - 流式生成过程中 assistant 消息内容（包括 thinking 与 content）发生变化时触发。
    - UI 通过监听该事件来重绘消息列表。
  - 约定：
    - ChatMessage 中可以包含 thinking 字段用于当前对话的“思考展示”，但持久化历史时不保存 thinking。
- onDidToolCallPending: Event<ToolCallPendingEvent>
  - 作用：
 当有需要用户审批的工具调用（如 edit_code）时触发。
 UI 监听此事件以弹出审批弹窗，展示工具要做的事情（目标文件、修改摘要等）。

---
2.2 文件：platform/llm/ILLMService.ts
作用：
 底层 LLM 调用的抽象层，屏蔽 OpenAI / Anthropic / Gemini 等不同厂商的 SDK 差异。
ServiceIdentifier： ILLMServiceId
接口定义：
- streamResponse(messages: LLMMessage[], options: ModelConfig): Promise<StreamResponse>
  - 参数：
    - messages: LLMMessage[]：
 已经由 IPromptService 构建好的标准 LLM 消息数组（包含 system / user / assistant / tool 等角色）。
    - options: ModelConfig：
 模型参数（温度、max_tokens、top_p、reasoning_effort 等），可基于 IModelRegistryService 提供的默认配置再叠加用户设置。
  - 作用：
 发起一次 LLM 流式请求，返回一个 StreamResponse 对象。
- StreamResponse（接口示意）：
  - onToken: Event<LLMDeltaChunk>
    - 流式增量 token 事件，用于逐字/逐句更新 UI。
  - onError: Event<Error>
  - onDone: Event<LLMFinalMessage>
    - 最终完整消息，包含：
      - 完整的 assistant content
      - 是否有 tool_calls
      - 模型元数据
  - cancel(): void
    - 取消当前请求，供 abort() 调用。
注意：ILLMService 只负责调用模型和管理流，不做任何 Agent 逻辑（如工具循环、审批等）。

---
2.3 文件：platform/agent/IPromptService.ts
作用：
 负责“脏活累活”：把用户的输入、历史记录、模式（Agent/Chat/Normal）、上下文文件内容组装成 LLM 能理解的 LLMMessage[]。
ServiceIdentifier： IPromptServiceId
接口定义：
- constructMessages(history: ChatMessage[], mode: ChatMode, context: ContextItem[], options: PromptBuildOptions): Promise<LLMMessage[]>
  - 参数：
    - history: ChatMessage[]：对话历史（其中已去掉需要隐藏的思考内容）。
    - mode: ChatMode：'agent' | 'chat' | 'normal'。
    - context: ContextItem[]：上下文条目：
      - 文件（Overleaf 项目中的 tex / bib / 代码文件）
      - 选中片段
      - 其他元信息（如当前光标位置等）
    - options: PromptBuildOptions（可选，示例）：
      - modelId: ModelId
      - tools?: ToolDefinition[]（Agent 模式下传入）
      - systemPromptOverride?: string
  - 作用：
    1. System Prompt 构建：
      - 根据 mode 选择不同模板：
        - Agent 模式：强调工具使用规范、思考流程（先思考再调用工具）。
        - Chat 模式：偏向自然对话，通常工具关闭或较少。
        - Normal 模式：可选单轮问答，可能截断历史。
      - 可根据 modelId 做适配（不同厂商的 system 指令风格不同）。
    2. Context 处理：
      - 遍历 context，通过 IEditorService 等接口读取文件真实内容或选中片段。
      - 对超大文件内容进行适当截断，保证不超出 ModelCapabilities.maxContextTokens。
    3. 历史与当前问题拼接：
      - 将 System Prompt + 上下文包装 + 截断后的历史消息 + 当前用户问题，组合成最终的 LLMMessage[]。
    4. （可选）Tool 描述拼接：
      - 如果 Agent 模式允许工具调用，可将工具定义（XML/JSON Schema 等）拼进 system 或专门的 instruction 消息中。

---
3. Services 层 (L3 - 业务实现)
这一层是“大脑”，负责状态管理、Agent 循环和业务规则。

---
3.1 文件：services/agent/ChatService.ts
继承： Disposable（因为要管理 LLM 流、事件订阅等）
实现接口： IChatService
依赖注入：
@injectable(
  ILLMServiceId,
  IPromptServiceId,
  IToolServiceId,
  IEditorServiceId,
  IModelRegistryServiceId, // 通过模型注册表获取能力和默认配置
  IConversationStoreServiceId? // 可选：管理会话持久化
)
核心状态
- private _messages: ChatMessage[]
 当前活跃会话的消息列表（仅内存中的视图）。
- private _isProcessing: boolean
 防止重复提交和并发请求。
- private _currentStream?: StreamResponse
 当前正在进行的 LLM 流，用于 abort。
- private _pendingToolCalls: Map<string, PendingToolCall>
 存放等待用户审批的工具调用。
若支持多会话，可扩展为 Map<conversationId, ChatSessionState>，此处先按“当前会话”简化。
核心函数实现
sendMessage(...)
1. 写入用户消息：
  - 创建 ChatMessage（role = 'user'，content = input）。
  - push 到 _messages，触发一次 onDidMessageUpdate。
2. 构建 Prompt：
  - 根据 options.modelId 通过 IModelRegistryService 取出 ModelCapabilities 和默认 ModelConfig。
  - 调用 promptService.constructMessages(_messages, options.mode, options.contextItems, { modelId, tools: availableTools }) 得到 LLMMessage[]。
3. 启动 Agent Loop（第一轮）：
  - 调用 this.llmService.streamResponse(messages, modelConfig) 获取 StreamResponse。
  - 订阅：
    - onToken：
      - 将增量 token 拼接到当前 assistant 消息：
        - 如果模型有 <thinking> 标签，解析出 thinking 和可展示 content。
      - 更新 _messages 中最后一条 assistant 消息，并触发 onDidMessageUpdate。
    - onDone：
      - 解析最终的 LLMFinalMessage：
        - 更新最后一条 assistant 消息为完成状态。
        - 检测是否包含 tool_calls。
      - 如果没有 tool_calls，结束本轮对话：
        - 标记 _isProcessing = false。
        - 将对话（不含 thinking）交给 ConversationStore 持久化（本地或云端）。
      - 如果有 tool_calls，进入工具处理流程（见下）。
    - onError：
      - 更新状态为错误，触发 UI 提示，重置 _isProcessing。
4. 工具检测与分支：
  - 对每个 tool_call：
    - 通过 IToolService 查找对应的 ITool 元信息。
    - 如果 tool.needApproval === false（只读工具，如搜索）：
      - 直接调用 toolService.executeTool(...)。
      - 将结果包装为一条 tool 消息 (ToolMessage) 插入 _messages。
      - 再次调用 Prompt 构建 + llmService.streamResponse，进入下一轮 Agent Loop。
    - 如果 tool.needApproval === true（敏感操作，如编辑代码）：
      - 构建 ToolCallPendingEvent（包含 tool 名称、目标文件、变更摘要等），放入 _pendingToolCalls。
      - 触发 onDidToolCallPending 事件，等待 UI 中用户审批。
approveToolCall(toolCallId: string)
1. 从 _pendingToolCalls 中取出对应的调用信息，移除该 pending 记录。
2. 调用 toolService.executeTool(name, args) 执行工具。
3. 将工具执行结果封装为一条 ToolMessage（role = 'tool'）插入 _messages。
4. 再次调用 promptService.constructMessages(...) 构建新的 LLMMessage[]，并重新调用 llmService.streamResponse(...)，继续 Agent Loop。
5. 最终 LLM 返回 “已为您修改标题…” 之类的自然语言结果，更新 assistant 消息并持久化。
rejectToolCall(toolCallId: string)
1. 从 _pendingToolCalls 中移除对应记录。
2. 向 _messages 添加一条系统/assistant 消息，说明用户拒绝了该操作。
3. 可选：将该信息作为上下文再次发给 LLM，让其给出替代方案或解释。
abort()
1. 如果存在 _currentStream，调用其 cancel()。
2. 更新内部状态为 aborted，并触发消息更新（例如在当前 assistant 消息上标记“已中断”）。

---
3.2 文件：services/agent/PromptService.ts
实现接口： IPromptService
依赖注入： @injectable(IEditorServiceId, IModelRegistryServiceId, IToolServiceId?)
核心函数实现
- constructMessages(history, mode, context, options)
1. System Prompt 构建：
  - 根据 mode 选择不同模板：
    - Agent 模式： 强调工具调用规范、思考过程
    - Chat 模式： 调用部分工具，不会去修改文件
    - Normal 模式： 普通的llm问答，没有agent相关的提示词
  - 根据 options.modelId 从 IModelRegistryService 获取模型能力，调整提示结构（如是否支持 system prompt、是否支持 tool calling）。
2. Context 处理：
  - 遍历 context 中的文件/片段描述：
    - 利用 this.editorService.readFile(uri) 通过 RPC 获取 Overleaf 页面真实内容。
  - 对于超长文件，进行截断或摘要，避免超过 maxContextTokens。
  - 将这些内容包装为一条或多条 system / user 辅助信息消息，例如：
    - “以下是 main.tex 的内容：……”
    - “以下是用户选中的代码片段：……”
3. 历史消息拼接与截断：
  - 将历史中的 ChatMessage[] 转换为对应的 LLMMessage[]（只包含最终可展示的内容，不包含 thinking 字段）。
  - 根据 ModelCapabilities.maxContextTokens 智能截断历史（例如保留最近 N 轮）。
4. 工具定义拼接（Agent 模式）：
  - 若 mode === 'agent' 且模型支持工具调用：
    - 从 IToolService 或 options.tools 中获取当前可用工具的定义（名称、参数 schema、描述）。
    - 以 XML、JSON Schema 或 OpenAI tool 格式嵌入到系统提示或专用指令中。
5. 最终结果：
  - 返回最终顺序的 LLMMessage[]：
    - [System Prompt] + [Context 包装] + [截断后的历史] + [当前用户消息]

---
3.3 文件：services/agent/tools/ToolService.ts
作用：
 工具注册表与执行器，统一管理所有 Agent 工具。
依赖注入： @injectable(IEditorServiceId)
核心职责
- 管理工具生命周期（注册、查询）。
- 执行具体工具逻辑（读写文件、搜索等），对上提供统一接口。
核心函数
- registerTool(tool: ITool): void
  - 注册一个工具实例到内部表中（例如 Map<string, ITool>）。
- getTool(name: string): ITool | undefined
  - 通过名称查找工具元信息与实现。
- executeTool(name: string, args: any): Promise<any>
  - 找到对应工具实现并执行：
    - 如果是只读工具：调用 editorService.readFile(...)、搜索等。
    - 如果是编辑类工具：调用 editorService.applyEdit(...)，RPC 到 Content Script 修改 Overleaf DOM。
具体工具类（位于 services/agent/tools/ 下）
- ReadFileTool.ts
  - 通过 editorService.readFile(uri) 读取文件内容并返回。
- EditCodeTool.ts
  - 根据 LLM 给出的编辑指令，调用 editorService.applyEdit(...) 修改 Overleaf 文本内容。
  - 标记 needApproval = true，由 ChatService 触发审批流程，用户批准后再执行。

---
4. Workbench 层 (L4 - UI 呈现)
这一层只负责展示状态和转发用户操作，不写任何业务逻辑或 LLM 调用细节。

---
文件：workbench/parts/chat/ChatPanel.tsx
Hooks 使用
const chatService = useService<IChatService>(IChatServiceId);
const messages = useServiceEvent(chatService.onDidMessageUpdate, []);
const pendingTool = useServiceEvent(chatService.onDidToolCallPending, null);
主要逻辑
- 渲染消息列表：
  - 遍历 messages 数组：
    - User 消息右对齐显示。
    - Assistant 消息：
      - 若包含 thinking 且当前是最新一轮，可折叠显示“思考中…”内容。
      - content 部分作为正式回答显示。
    - Tool 消息可以以系统消息样式展示工具调用及结果（可选）。
- 输入框与发送：
  - 用户输入问题，选择模型与模式（agent/chat/normal），可选添加上下文文件/选中内容。
  - 按 Enter 或点击发送：
chatService.sendMessage(input, {
  mode,
  modelId,
  contextItems,
  conversationId, // 当前会话ID（可选）
});
- 审批弹窗：
  - 如果 pendingTool 不为空：
    - 在界面底部渲染一个卡片：
      - 文本示例：“工具调用请求：AI 想要修改 main.tex 的标题。”
      - 按钮：[批准] / [拒绝]
    - 点击 [批准]：
chatService.approveToolCall(pendingTool.id);
    - 点击 [拒绝]：
chatService.rejectToolCall(pendingTool.id);
- 会话列表与历史（可选扩展）：
  - ChatPanel 可以通过 ConversationStore 的事件渲染对话列表，让用户切换“新对话 / 历史对话”，但这部分逻辑依然只调用 Service，不直接操作底层存储。

---
5. 流程串联示例 (Scenario: User asks to edit code)
1. 用户操作：
  - 在 Workbench 选择 “Agent Mode”，选中 main.tex，输入“把标题改成 Hello World”，点击发送。
2. Workbench：
  - 调用 chatService.sendMessage(...)，携带：
    - mode = 'agent'
    - modelId = 'gpt-4.1'（示例）
    - contextItems 包含 main.tex。
3. ChatService：
  - 将用户消息添加到 _messages。
  - 调用 promptService.constructMessages(...)。
  - PromptService：
    - 通过 editorService.readFile('main.tex') 获取文件内容。
    - 构建 Agent System Prompt，拼上 main.tex 内容和历史对话。
  - ChatService 调用 llmService.streamResponse(...) 启动流式调用。
4. LLM：
  - 流式返回：
<thinking>...</thinking><tool_use name="edit_code">...</tool_use>。
5. ChatService：
  - 解析流式结果：
    - 实时更新当前 assistant 消息的 thinking 与可见 content，触发 onDidMessageUpdate。
  - Workbench：
    - 实时显示灰色“思考中”内容与部分自然语言输出。
  - 当 onDone 触发：
    - ChatService 从最终消息中解析出 edit_code 工具调用。
    - 查看工具元信息，发现 needApproval = true。
    - 构造 ToolCallPendingEvent，触发 onDidToolCallPending。
6. Workbench：
  - 监听到 pendingTool 事件，在底部显示：“AI 想要修改 main.tex 标题为 Hello World，是否允许？”。
7. 用户操作：
  - 点击“允许”。
8. Workbench：
  - 调用 chatService.approveToolCall(pendingTool.id)。
9. ChatService：
  - 调用 toolService.executeTool('edit_code', args)。
  - EditCodeTool 通过 editorService.applyEdit(...) RPC 到 Content Script，修改 Overleaf DOM 中的 main.tex。
  - 返回执行结果 "Success"。
  - ChatService 构建一条 ToolMessage（包含编辑摘要）加入 _messages。
  - 再次调用 promptService.constructMessages(...)，将工具执行结果作为新上下文发送给 LLM，继续 Agent Loop。
10. LLM：
  - 看到工具执行成功后，返回自然语言结果：“已为您将标题修改为 Hello World。”
11. ChatService：
  - 收到最终 assistant 消息：
    - 更新 _messages，触发 onDidMessageUpdate。
    - 将本轮完整对话（只含 content，不含 thinking）持久化到本地或云端（通过 ConversationStore）。
  - 整个流程结束，等待下一次用户提问。

---
6. 架构重构：解耦与职责分离 (2024 重构)

本节描述 2024 年对 Agent 系统的重大重构，目标是解决服务耦合、职责不清的问题。

6.1 重构前的问题

问题 1：ChatService 是"上帝类"
- 承担了太多职责：会话管理、Agent Loop、工具决策、LLM 调用、模型配置
- 代码量过大（600+ 行），难以维护和测试
- 违反单一职责原则

问题 2：LLMService 职责混乱
- 既是 HTTP 客户端，又做厂商适配
- 需要处理不同厂商的参数差异（maxTokensParamName 等）
- 协议选择逻辑复杂（OpenAI / Anthropic / Custom）

问题 3：工具调用逻辑分散
- 工具选择在 ChatService
- 工具审批在 ChatService
- 工具执行在 ToolService
- Agent Loop 又回到 ChatService
- 缺少统一的编排层

6.2 重构后的架构

新架构分层（从上到下）：

┌─────────────────────────────────────────────────────────────┐
│                        Workbench (UI)                         │
│                     只负责展示和用户交互                        │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                       ChatService                             │
│  职责：会话状态管理、消息历史、事件分发                        │
│  依赖：IAgentService                                          │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                       AgentService (新增)                     │
│  职责：Agent Loop 编排、工具调用决策、审批流程管理              │
│  依赖：ILLMService, IPromptService, IToolService,             │
│        IModelRegistryService                                  │
└──────────┬──────────────────────────┬───────────────────────┘
           │                          │
           ▼                          ▼
┌──────────────────────┐    ┌──────────────────────┐
│   PromptService      │    │   ToolService        │
│ 职责：提示词构建      │    │ 职责：工具注册+执行   │
└──────────────────────┘    └──────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────┐
│                    LLMProviderService (新增)                  │
│  职责：LLM 厂商适配、参数转换、协议适配                         │
│  依赖：IModelRegistryService, IConfigurationService           │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                       LLMService                              │
│  职责：纯粹的 HTTP 客户端，发送请求、解析流                     │
│  依赖：ILLMProviderService                                    │
└─────────────────────────────────────────────────────────────┘

6.3 新增服务详解

6.3.1 AgentService（核心编排层）

职责：
- Agent Loop 循环控制（最多 N 轮迭代）
- 根据模型能力选择工具（agent 模式 vs chat 模式）
- 工具调用决策（自动执行 vs 需要审批）
- 工具审批状态管理
- 防止死循环

关键接口（platform/agent/IAgentService.ts）：

export interface IAgentService {
  startLoop(
    initialMessages: ChatMessage[],
    options: AgentOptions
  ): Promise<AgentLoopController>;
  
  approveToolCall(loopId: string, toolCallId: string): Promise<void>;
  rejectToolCall(loopId: string, toolCallId: string): Promise<void>;
  
  onDidLoopUpdate: Event<AgentLoopState>;
  onDidToolCallPending: Event<ToolCallPendingEvent>;
}

核心流程：
1. 根据 modelId 和 mode 选择可用工具
2. 构建 LLM 配置（透传模型默认配置 + 工具定义）
3. 调用 LLM 获取响应
4. 检查是否有工具调用
5. 如果有工具且需要审批：
   - 触发 onDidToolCallPending 事件
   - 暂停 Loop，等待 approveToolCall
6. 如果有工具且不需要审批：
   - 直接执行工具
   - 将结果加入消息列表
   - 继续下一轮 Loop
7. 如果没有工具调用：结束 Loop

6.3.2 LLMProviderService（厂商适配层）

职责：
- 根据模型选择正确的适配器（OpenAI / OpenAI-Compatible / Anthropic）
- 将统一的 LLMConfig 转换为各厂商的请求格式
- 处理厂商差异（maxTokensParamName、system prompt 格式等）
- 提供流解析策略

关键接口（platform/llm/ILLMProviderService.ts）：

export interface ILLMProviderService {
  buildRequestConfig(
    messages: LLMMessage[],
    config: LLMConfig
  ): Promise<LLMProviderRequest>;
  
  parseStreamChunk(
    dataString: string,
    provider: 'openai' | 'openai-compatible' | 'anthropic'
  ): ParsedStreamChunk | null;
}

适配器架构：

services/llm/adapters/
├── BaseLLMAdapter.ts          # 适配器基类
├── OpenAIAdapter.ts           # OpenAI 官方 API
├── OpenAICompatibleAdapter.ts # DeepSeek / Gemini 等
└── AnthropicAdapter.ts        # Claude API

每个适配器负责：
- 构建请求端点和请求头
- 转换消息格式（如 Anthropic 的 system 参数单独传递）
- 处理模型特定参数（thinking、reasoning_effort 等）

6.4 重构后的职责划分

服务          职责                               依赖
────────────────────────────────────────────────────────────────
ChatService   会话管理、消息历史、事件分发       IAgentService

AgentService  Agent Loop、工具编排、审批管理     ILLMService
                                                 IPromptService
                                                 IToolService
                                                 IModelRegistryService

LLMProvider   厂商适配、参数转换                 IModelRegistryService
Service                                          IConfigurationService

LLMService    HTTP 客户端、流解析                ILLMProviderService

PromptService 提示词构建                         无

ToolService   工具注册、执行                     无

ModelRegistry 模型能力查询                       无
Service

6.5 核心优势

1. 单一职责：每个服务只做一件事
   - ChatService：200 行（原 700 行）
   - LLMService：300 行（原 780 行）

2. 易于测试：可以独立 mock 每个服务
   - 测试 AgentService 时，mock LLMService
   - 测试 ChatService 时，mock AgentService

3. 易于扩展：
   - 新增模型？只需添加 Adapter
   - 新增 Agent 策略？只需修改 AgentService
   - 新增工具？只需注册到 ToolService

4. 符合架构原则：严格遵守单向依赖和依赖注入

6.6 迁移指南

从旧版本迁移到新版本：

步骤 1：更新服务注册顺序（App.tsx）

// 旧版本（错误）
di.registerDescriptor(new ServiceDescriptor(IChatServiceId, ChatService, ...));
di.registerDescriptor(new ServiceDescriptor(ILLMServiceId, LLMService, ...));

// 新版本（正确）
di.registerDescriptor(new ServiceDescriptor(IModelRegistryServiceId, ModelRegistryService, ...));
di.registerDescriptor(new ServiceDescriptor(IToolServiceId, ToolService, ...));
di.registerDescriptor(new ServiceDescriptor(IPromptServiceId, PromptService, ...));
di.registerDescriptor(new ServiceDescriptor(ILLMProviderServiceId, LLMProviderService, ...));
di.registerDescriptor(new ServiceDescriptor(ILLMServiceId, LLMService, ...));
di.registerDescriptor(new ServiceDescriptor(IAgentServiceId, AgentService, ...));
di.registerDescriptor(new ServiceDescriptor(IChatServiceId, ChatService, ...));

步骤 2：UI 层无需改动

// ChatPanel.tsx 保持不变
const chatService = useService<IChatService>(IChatServiceId);
await chatService.sendMessage(input, options);

原因：IChatService 接口未改变，只是内部实现委托给了 AgentService。

步骤 3：扩展新模型

// services/llm/adapters/CustomAdapter.ts
export class CustomAdapter extends BaseLLMAdapter {
  buildRequest(messages, config, apiConfig) {
    // 自定义厂商的请求格式
  }
}

// LLMProviderService.ts
private getAdapter(provider: string): BaseLLMAdapter {
  switch (provider) {
    case 'custom': return new CustomAdapter(this.modelRegistry);
    // ...
  }
}

---
7. 关键文件列表（更新后）

Platform 层（接口定义）：
- platform/agent/IChatService.ts（对话编排接口）
- platform/agent/IAgentService.ts（Agent Loop 接口，新增）
- platform/agent/IPromptService.ts（提示词组装接口）
- platform/agent/IToolService.ts（工具服务接口）
- platform/llm/ILLMService.ts（LLM 调用接口）
- platform/llm/ILLMProviderService.ts（厂商适配接口，新增）
- platform/llm/IModelRegistryService.ts（模型注册表接口）

Services 层（业务实现）：
- services/agent/ChatService.ts（会话管理，重构简化）
- services/agent/AgentService.ts（Agent Loop 核心，新增）
- services/agent/PromptService.ts（提示词组装）
- services/agent/ToolService.ts（工具管理与执行）
- services/llm/LLMService.ts（HTTP 客户端，重构简化）
- services/llm/LLMProviderService.ts（厂商适配，新增）
- services/llm/adapters/BaseLLMAdapter.ts（适配器基类，新增）
- services/llm/adapters/OpenAIAdapter.ts（OpenAI 适配器，新增）
- services/llm/adapters/OpenAICompatibleAdapter.ts（OpenAI 兼容适配器，新增）
- services/llm/adapters/AnthropicAdapter.ts（Anthropic 适配器，新增）
- services/llm/ModelRegistryService.ts（模型注册表实现）

Workbench 层（UI）：
- workbench/parts/Sidebar.tsx（侧边栏，包含聊天面板）
- workbench/parts/App.tsx（应用入口，DI 容器注册）

这套重构后的架构严格遵守单向依赖和依赖注入原则，并且进一步明确了：
- Base 只做类型地基
- Platform 只定义接口契约
- Services 职责清晰，每个服务单一职责
- Workbench 只负责展示与交互
---
8. 工具系统详解（Tools System）

8.1 Platform 层（工具契约）

文件：platform/agent/IToolService.ts

作用：定义"一个工具究竟是什么"。这里不实现任何逻辑，只说明工具的"名片"和"能力"。

关键内容：
- 工具元信息（ITool 接口）：
  - name：供 LLM 调用时使用的工具名（如 "read_file", "edit_code"）
  - description：给 LLM 的自然语言说明
  - needApproval：是否需要用户手动审批（如修改代码）
  - type：工具类型（'read' | 'write' | 'search'）
  - parameters：工具入参的 JSON Schema
- 执行接口：
  - execute(args) -> Promise<ToolExecutionResult>
    - args：LLM 给出的参数对象（已从 JSON 反序列化）
    - 返回：{ success: boolean; data?: any; error?: string }

工具服务接口（IToolService）：
- registerTool(tool: ITool)：注册一个工具
- getTool(name: string)：根据名称获取工具实例
- executeTool(name: string, args: any)：执行工具
- listTools()：返回所有已注册工具
- getReadOnlyTools()：返回不需要审批的工具（chat 模式使用）
- getAllTools()：返回所有工具（agent 模式使用）

8.2 Services 层（工具管理与实现）

文件：services/agent/ToolService.ts

作用：Platform 层 IToolService 的默认实现，是真正的"工具注册表 + 单一入口执行器"。

依赖注入：@injectable()（无依赖，工具本身通过参数获取需要的服务）

内部状态：
- 一个 Map<string, ITool>：
  - key：工具名（tool.name）
  - value：工具对象（含元信息 + execute）

主要职责：
1. 工具注册（初始化阶段）
   - 在构造函数中调用 initializeBuiltInTools()
   - 注册内置工具：read_file, edit_code, search_content, list_files
   - 外部可通过 registerTool() 动态注册新工具

2. 工具查询
   - getTool(name)：AgentService 解析 LLM 的 tool_call 时使用
   - 用于判断 needApproval / type

3. 工具执行统一入口
  - executeTool(name, args)：
     - 从 Map 中找出对应 ITool
     - 调用 tool.execute(args)
     - 捕获异常并包装成统一的 ToolExecutionResult
     - 记录执行时间

8.3 具体工具类位置与职责

所有具体工具类目前内联在 ToolService 中，未来可拆分到独立文件：

services/agent/tools/ 目录下，每个工具一个文件

示例分类（蓝图）：
1. 编辑器类工具 (Editor Tools)
  - 位置：services/agent/tools/editor/
  - 例子：
     - ReadFileTool：只读，读取 Overleaf 文件内容
     - EditCodeTool：修改文件内容（编辑 tex / 代码），需要审批

2. 项目类工具 (Project Tools)
  - 位置：services/agent/tools/project/
  - 例子：
     - ListFilesTool：列出项目中的文件列表
     - SearchInProjectTool：在项目中搜索特定文本/宏

3. 外部服务类工具 (External Tools)
  - 位置：services/agent/tools/external/
  - 例子：
     - WebSearchTool：调用搜索 API
     - CitationLookupTool：查文献 / DOI

每个工具类都实现 ITool 接口，不直接依赖 UI，也不直接操作 DOM，所有需要的能力都从注入的服务（如 IEditorService）中获取。




---
9. 检查清单 (Pre-commit Checklist)
   
在提交代码前，请自问：

[ ] 我是否在 UI 组件里写了业务逻辑？（如果是，请移到 Service）

[ ] 我是否直接实例化了一个 Service 类？（如果是，请改为依赖注入）

[ ] 我新写的 Service 是否使用了 @injectable() 装饰器声明依赖？

[ ] 我新写的 Service 是否继承了 Disposable 并正确处理了销毁？

[ ] 上层代码是否引用了下层目录的文件？（ESLint 应该报错）

[ ] AI 工具是否通过 IEditorService 操作编辑器，而不是直接操作 DOM？

[ ] 服务是否正确注册到 DI 容器（使用 ServiceDescriptor 或 registerInstance）？

[ ] 服务职责是否单一？（如果一个服务超过 500 行，考虑拆分）

[ ] 是否有循环依赖？（A 依赖 B，B 又依赖 A）

[ ] 是否正确使用了适配器模式？（新增 LLM 厂商应该创建新的 Adapter，而不是修改 LLMService）

核心口号： 
- "所有的 UI 都是暂时的，所有的接口才是永恒的。"
- "单一职责，职责分离。一个服务只做一件事。"
- "依赖抽象，不依赖实现。依赖 Interface，不依赖 Class。"

编写代码时，请想象 UI 可能会被完全重写，但你的 Service 逻辑应该不需要改动。