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
│
├── platform/               # [L2] 接口定义层 (只定义 Interface 和 DI 标识符)
│   ├── editor/             # IEditorService.ts
│   ├── auth/               # IAuthService.ts
│   ├── agent/              # IAgentService.ts
│   ├── tools/              # ITool.ts (AI 工具标准接口)
│   ├── instantiation/      # DI 容器核心代码 (ServiceCollection)
│   └── configuration/      # IConfigurationService.ts
│
├── services/               # [L3] 业务实现层 (具体的逻辑代码)
│   ├── editor/             # OverleafEditorService.ts (DOM 操作/RPC 调用)
│   ├── auth/               # FirebaseAuthService.ts
│   ├── agent/              # AgentService.ts (LLM 调用核心)
│   │   └── tools/          # 具体工具实现 (如 ReadFileTool.ts, WebSearchTool.ts)
│   └── log/                # LogService.ts
│
├── workbench/              # [L4] UI 表现层 (React 组件)
│   ├── parts/              # 具体功能面板 (ChatPanel, LoginPanel)
│   ├── common/             # 通用 UI 组件 (Button, Input)
│   └── hooks/              # useService.ts (连接 React 与 Service 层的桥梁)
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

6. 检查清单 (Pre-commit Checklist)
在提交代码前，请自问：

[ ] 我是否在 UI 组件里写了业务逻辑？（如果是，请移到 Service）

[ ] 我是否直接实例化了一个 Service 类？（如果是，请改为依赖注入）

[ ] 我新写的 Service 是否使用了 @injectable() 装饰器声明依赖？

[ ] 我新写的 Service 是否继承了 Disposable 并正确处理了销毁？

[ ] 上层代码是否引用了下层目录的文件？（ESLint 应该报错）

[ ] AI 工具是否通过 IEditorService 操作编辑器，而不是直接操作 DOM？

[ ] 服务是否正确注册到 DI 容器（使用 ServiceDescriptor 或 registerInstance）？

核心口号： 所有的 UI 都是暂时的，所有的接口才是永恒的。 编写代码时，请想象 UI 可能会被完全重写，但你的 Service 逻辑应该不需要改动。