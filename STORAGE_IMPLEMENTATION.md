# Storage Service 实现文档

## 概述

已完成本地存储服务的实现，遵循项目的微内核架构设计，提供类型安全、事件驱动的键值存储能力。

## 实现文件清单

### 1. Base 层（基础设施）
```
src/base/browser/storage.ts
```
- `StorageScope` - 存储范围枚举（LOCAL/SYNC/SESSION）
- `IStorageAdapter` - 存储适配器接口
- `ChromeStorageAdapter` - Chrome Storage API 适配器
- `InMemoryStorageAdapter` - 内存存储适配器（用于测试）

### 2. Platform 层（接口定义）
```
src/platform/storage/storage.ts
```
- `IStorageService` - 存储服务接口
- `StorageChangeEvent` - 存储变化事件类型
- `IStorageServiceId` - DI 服务标识符

### 3. Services 层（业务实现）
```
src/services/storage/StorageService.ts
src/services/storage/StorageServiceProxy.ts
src/services/storage/index.ts
```
- `StorageService` - 存储服务实现（Content Script 环境）
- `StorageServiceProxy` - RPC 代理（Sidepanel 环境）

### 4. Workbench 层（React 集成）
```
src/workbench/hooks/useStorage.ts
src/workbench/parts/StorageExample.tsx
```
- `useStorage` - 持久化状态 Hook
- `useStorageValue` - 只读存储值 Hook
- `useStorageByPrefix` - 按前缀获取存储 Hook
- `StorageExamplesPage` - 完整使用示例

## 核心特性

### ✅ 分层架构
严格遵循 Base → Platform → Services → Workbench 的分层设计

### ✅ 类型安全
```typescript
const config = await storageService.get<UserConfig>('app.config', defaultConfig);
```

### ✅ 事件驱动
```typescript
storageService.onDidChangeStorage((event) => {
  console.log(`Key ${event.key} changed from ${event.oldValue} to ${event.newValue}`);
});
```

### ✅ 依赖注入
```typescript
@injectable()
class StorageService extends Disposable implements IStorageService {
  // ...
}
```

### ✅ React Hook 集成
```typescript
const [userName, setUserName] = useStorage('user.name', 'Guest');
```

## 使用指南

### 1. 注册服务

**Content Script 环境：**
```typescript
// extension/content/main.tsx
import { InstantiationService } from './platform/instantiation';
import { IStorageServiceId } from './platform/storage/storage';
import { StorageService } from './services/storage/StorageService';
import { StorageScope } from './base/browser/storage';

const container = new InstantiationService();
container.registerInstance(
  IStorageServiceId,
  new StorageService(StorageScope.LOCAL)
);
```

**Sidepanel 环境（使用 RPC）：**
```typescript
// extension/sidepanel/main.tsx
import { InstantiationService, ServiceDescriptor } from './platform/instantiation';
import { IStorageServiceId } from './platform/storage/storage';
import { StorageServiceProxy } from './services/storage/StorageServiceProxy';
import { IRPCClientID } from './platform/rpc/rpc';

const container = new InstantiationService();
const rpcClient = createRPCClient();

container.registerInstance(IRPCClientID, rpcClient);
container.registerDescriptor(
  new ServiceDescriptor(IStorageServiceId, StorageServiceProxy, [IRPCClientID])
);
```

**RPC Server 注册方法：**
```typescript
// extension/content/main.tsx
import { RPCServer } from './services/rpc/RPCServer';
import { StorageService } from './services/storage/StorageService';

const storageService = new StorageService();
const rpcServer = new RPCServer(channel);

// 注册存储服务的 RPC 方法
rpcServer.registerMethod('storage.get', (key, defaultValue) => 
  storageService.get(key, defaultValue)
);
rpcServer.registerMethod('storage.set', (key, value) => 
  storageService.set(key, value)
);
rpcServer.registerMethod('storage.remove', (key) => 
  storageService.remove(key)
);
rpcServer.registerMethod('storage.clear', () => 
  storageService.clear()
);
rpcServer.registerMethod('storage.keys', () => 
  storageService.keys()
);
rpcServer.registerMethod('storage.has', (key) => 
  storageService.has(key)
);
rpcServer.registerMethod('storage.getByPrefix', (prefix) => 
  storageService.getByPrefix(prefix)
);

rpcServer.start();
```

### 2. 在 React 组件中使用

**方式 1：使用 useStorage Hook（推荐）**
```typescript
import { useStorage } from '../hooks/useStorage';

function UserProfile() {
  const [userName, setUserName] = useStorage('user.name', 'Guest');
  const [theme, setTheme] = useStorage<'light' | 'dark'>('ui.theme', 'light');

  return (
    <div>
      <input 
        value={userName} 
        onChange={(e) => setUserName(e.target.value)} 
      />
      <select 
        value={theme} 
        onChange={(e) => setTheme(e.target.value)}
      >
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </div>
  );
}
```

**方式 2：直接使用服务**
```typescript
import { useService, useServiceEvent } from '../hooks';
import { IStorageServiceId } from '../../platform/storage/storage';
import type { IStorageService } from '../../platform/storage/storage';

function Component() {
  const storageService = useService<IStorageService>(IStorageServiceId);
  
  // 监听存储变化
  const lastChange = useServiceEvent(
    storageService.onDidChangeStorage,
    null
  );

  const handleSave = async () => {
    await storageService.set('key', 'value');
  };

  return <button onClick={handleSave}>Save</button>;
}
```

**方式 3：只读值**
```typescript
import { useStorageValue } from '../hooks/useStorage';

function Header() {
  const userName = useStorageValue('user.name', 'Guest');
  return <div>Welcome, {userName}</div>;
}
```

**方式 4：按前缀获取**
```typescript
import { useStorageByPrefix } from '../hooks/useStorage';

function SettingsPanel() {
  const userSettings = useStorageByPrefix('user.');
  
  return (
    <pre>{JSON.stringify(userSettings, null, 2)}</pre>
  );
}
```

### 3. 自定义 Hook 封装

```typescript
// workbench/hooks/useUserProfile.ts
import { useStorage } from './useStorage';

interface UserProfile {
  name: string;
  email: string;
  avatar: string;
}

export function useUserProfile() {
  const [profile, setProfile] = useStorage<UserProfile>('user.profile', {
    name: 'Guest',
    email: '',
    avatar: ''
  });

  const updateName = async (name: string) => {
    await setProfile({ ...profile, name });
  };

  const updateEmail = async (email: string) => {
    await setProfile({ ...profile, email });
  };

  return {
    profile,
    updateName,
    updateEmail
  };
}
```

## API 文档

### IStorageService 接口

```typescript
interface IStorageService {
  // 存储变化事件
  readonly onDidChangeStorage: Event<StorageChangeEvent>;

  // 获取存储值
  get<T>(key: string, defaultValue?: T): Promise<T | undefined>;

  // 设置存储值
  set<T>(key: string, value: T): Promise<void>;

  // 删除存储项
  remove(key: string): Promise<void>;

  // 清空所有存储
  clear(): Promise<void>;

  // 获取所有键
  keys(): Promise<string[]>;

  // 判断键是否存在
  has(key: string): Promise<boolean>;

  // 获取指定前缀的所有项
  getByPrefix(prefix: string): Promise<{ [key: string]: any }>;
}
```

### StorageChangeEvent 类型

```typescript
interface StorageChangeEvent {
  key: string;      // 变化的键
  oldValue?: any;   // 旧值
  newValue?: any;   // 新值
}
```

### StorageScope 枚举

```typescript
enum StorageScope {
  LOCAL = 'local',      // 本地存储，不同步
  SYNC = 'sync',        // 同步存储，跨设备
  SESSION = 'session'   // Session 存储，浏览器关闭后清除
}
```

## 最佳实践

### 1. 键命名规范
```typescript
// ✅ 推荐：使用点分隔的命名空间
'app.version'
'user.profile.name'
'ui.theme.mode'
'chat.history.messages'

// ❌ 不推荐：平铺命名
'appVersion'
'userName'
```

### 2. 总是提供默认值
```typescript
// ✅ 推荐
const theme = await storage.get('ui.theme', 'light');

// ❌ 不推荐
const theme = await storage.get('ui.theme'); // 可能是 undefined
```

### 3. 使用类型参数
```typescript
// ✅ 推荐
interface UserConfig {
  name: string;
  age: number;
}
const config = await storage.get<UserConfig>('user.config', defaultConfig);

// ❌ 不推荐
const config = await storage.get('user.config'); // any 类型
```

### 4. 错误处理
```typescript
try {
  await storageService.set('key', largeData);
} catch (error) {
  // 处理存储配额超限等错误
  console.error('Storage failed:', error);
  showErrorToast('存储失败，可能是空间不足');
}
```

### 5. 批量操作
```typescript
// ✅ 推荐：批量读取
const allSettings = await storageService.getByPrefix('settings.');

// ❌ 不推荐：多次单独读取
const setting1 = await storageService.get('settings.a');
const setting2 = await storageService.get('settings.b');
```

### 6. 清理不再使用的数据
```typescript
// 定期清理旧数据
async function cleanupOldData() {
  const allKeys = await storageService.keys();
  const oldKeys = allKeys.filter(key => key.startsWith('temp.'));
  
  for (const key of oldKeys) {
    await storageService.remove(key);
  }
}
```

## 存储限制

### Chrome Storage 配额
- `chrome.storage.local`: 无限制（建议不超过 10MB）
- `chrome.storage.sync`: 100KB 总容量，单个键最大 8KB
- `chrome.storage.session`: 10MB（浏览器关闭后清除）

### 建议
- 不要存储大量数据（如完整文件内容）
- 不要存储敏感信息（如密码、Token）
- 使用压缩算法减小数据体积
- 定期清理不再使用的数据

## 测试

### 单元测试示例

```typescript
import { StorageService } from './StorageService';
import { InMemoryStorageAdapter } from '../../base/browser/storage';

describe('StorageService', () => {
  let service: StorageService;

  beforeEach(() => {
    const adapter = new InMemoryStorageAdapter();
    service = new StorageService(undefined, adapter);
  });

  afterEach(() => {
    service.dispose();
  });

  it('should get and set values', async () => {
    await service.set('key', 'value');
    const value = await service.get('key');
    expect(value).toBe('value');
  });

  it('should emit change events', async () => {
    const changes: any[] = [];
    service.onDidChangeStorage((event) => {
      changes.push(event);
    });

    await service.set('key', 'value');
    
    expect(changes).toHaveLength(1);
    expect(changes[0].key).toBe('key');
    expect(changes[0].newValue).toBe('value');
  });

  it('should get by prefix', async () => {
    await service.set('user.name', 'Alice');
    await service.set('user.email', 'alice@example.com');
    await service.set('ui.theme', 'dark');

    const userSettings = await service.getByPrefix('user.');
    
    expect(userSettings).toEqual({
      'user.name': 'Alice',
      'user.email': 'alice@example.com'
    });
  });
});
```

## 故障排查

### 问题 1：存储不生效
**可能原因：**
- 服务未正确注册到 DI 容器
- Chrome Storage 权限未声明

**解决方案：**
```json
// manifest.json
{
  "permissions": ["storage"]
}
```

### 问题 2：跨环境不同步
**可能原因：**
- Sidepanel 使用了 StorageService 而不是 StorageServiceProxy
- RPC 方法未正确注册

**解决方案：**
确保 Sidepanel 使用 StorageServiceProxy，并在 Content Script 中注册所有 RPC 方法。

### 问题 3：内存泄漏
**可能原因：**
- 组件卸载时未取消事件订阅

**解决方案：**
使用 Hook 会自动处理，如果手动订阅，确保调用 `disposable.dispose()`。

## 下一步

- [ ] 添加数据加密支持（敏感数据）
- [ ] 添加数据压缩（减小存储空间）
- [ ] 添加数据迁移工具（版本升级）
- [ ] 添加存储配额监控
- [ ] 添加数据导入导出功能

## 总结

存储服务实现完全遵循项目架构规范：

✅ **分层清晰**：Base → Platform → Services → Workbench  
✅ **依赖注入**：通过 DI 容器管理  
✅ **接口分离**：UI 只依赖接口  
✅ **事件驱动**：实时通知变化  
✅ **生命周期管理**：继承 Disposable  
✅ **跨环境支持**：Content Script 和 Sidepanel 透明切换  
✅ **类型安全**：完整的 TypeScript 支持  
✅ **React 集成**：提供便捷的 Hook  

现在可以在项目中使用存储服务进行配置管理、用户偏好设置、缓存数据等功能。
