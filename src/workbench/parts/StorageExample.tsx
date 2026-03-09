import React, { useState } from 'react';
import { useService } from '../hooks/useService';
import { useServiceEvent } from '../hooks/useServiceEvent';
import { useStorage, useStorageValue, useStorageByPrefix } from '../hooks/useStorage';
import { IStorageServiceId } from '../../platform/storage/storage';
import type { IStorageService } from '../../platform/storage/storage';

/**
 * 示例 1：使用服务实例直接操作
 */
export function StorageBasicExample() {
  const storageService = useService<IStorageService>(IStorageServiceId);
  const [inputValue, setInputValue] = useState('');
  const [loadedValue, setLoadedValue] = useState('');
  
  // 监听存储变化事件
  const lastChange = useServiceEvent(
    storageService.onDidChangeStorage,
    null
  );

  const handleSave = async () => {
    await storageService.set('example.value', inputValue);
    alert('保存成功！');
  };

  const handleLoad = async () => {
    const value = await storageService.get<string>('example.value', '');
    setLoadedValue(value || '未设置');
  };

  const handleClear = async () => {
    await storageService.remove('example.value');
    setLoadedValue('');
  };

  return (
    <div style={{ padding: '20px', border: '1px solid #ccc', margin: '10px' }}>
      <h3>示例 1：基础使用（直接调用服务）</h3>
      
      <div style={{ marginBottom: '10px' }}>
        <input 
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="输入要保存的值"
          style={{ marginRight: '10px' }}
        />
        <button onClick={handleSave}>保存</button>
        <button onClick={handleLoad}>加载</button>
        <button onClick={handleClear}>清除</button>
      </div>

      <div>
        <strong>已加载的值：</strong> {loadedValue}
      </div>

      {lastChange && (
        <div style={{ marginTop: '10px', padding: '10px', background: '#f0f0f0' }}>
          <strong>最后一次变化：</strong>
          <pre>{JSON.stringify(lastChange, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

/**
 * 示例 2：使用 useStorage Hook（推荐）
 */
export function StorageHookExample() {
  // 像 useState 一样使用，但数据会自动持久化
  const [userName, setUserName] = useStorage('user.name', 'Guest');
  const [userEmail, setUserEmail] = useStorage('user.email', '');
  const [theme, setTheme] = useStorage<'light' | 'dark'>('ui.theme', 'light');

  return (
    <div style={{ padding: '20px', border: '1px solid #ccc', margin: '10px' }}>
      <h3>示例 2：useStorage Hook（推荐）</h3>
      
      <div style={{ marginBottom: '10px' }}>
        <label>
          用户名：
          <input 
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            style={{ marginLeft: '10px' }}
          />
        </label>
      </div>

      <div style={{ marginBottom: '10px' }}>
        <label>
          邮箱：
          <input 
            value={userEmail}
            onChange={(e) => setUserEmail(e.target.value)}
            style={{ marginLeft: '10px' }}
          />
        </label>
      </div>

      <div style={{ marginBottom: '10px' }}>
        <label>
          主题：
          <select 
            value={theme} 
            onChange={(e) => setTheme(e.target.value as 'light' | 'dark')}
            style={{ marginLeft: '10px' }}
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      </div>

      <div style={{ marginTop: '20px', padding: '10px', background: theme === 'dark' ? '#333' : '#f9f9f9', color: theme === 'dark' ? 'white' : 'black' }}>
        <strong>预览：</strong>
        <p>用户：{userName}</p>
        <p>邮箱：{userEmail}</p>
        <p>主题：{theme}</p>
      </div>
    </div>
  );
}

/**
 * 示例 3：只读存储值
 */
export function StorageReadOnlyExample() {
  const userName = useStorageValue('user.name', 'Guest');
  const theme = useStorageValue('ui.theme', 'light');

  return (
    <div style={{ padding: '20px', border: '1px solid #ccc', margin: '10px' }}>
      <h3>示例 3：只读存储值（useStorageValue）</h3>
      <p>当前用户：{userName}</p>
      <p>当前主题：{theme}</p>
      <p style={{ color: '#666', fontSize: '12px' }}>
        注意：这是只读模式，数据会在其他组件修改后自动更新
      </p>
    </div>
  );
}

/**
 * 示例 4：按前缀获取所有配置
 */
export function StorageByPrefixExample() {
  const userSettings = useStorageByPrefix('user.');
  const uiSettings = useStorageByPrefix('ui.');

  return (
    <div style={{ padding: '20px', border: '1px solid #ccc', margin: '10px' }}>
      <h3>示例 4：按前缀获取（useStorageByPrefix）</h3>
      
      <div style={{ marginBottom: '10px' }}>
        <strong>用户设置（user.*）：</strong>
        <pre style={{ background: '#f0f0f0', padding: '10px' }}>
          {JSON.stringify(userSettings, null, 2)}
        </pre>
      </div>

      <div>
        <strong>UI 设置（ui.*）：</strong>
        <pre style={{ background: '#f0f0f0', padding: '10px' }}>
          {JSON.stringify(uiSettings, null, 2)}
        </pre>
      </div>
    </div>
  );
}

/**
 * 示例 5：跨组件同步
 */
export function StorageSyncExample() {
  const [count, setCount] = useStorage('sync.counter', 0);

  return (
    <div style={{ padding: '20px', border: '1px solid #ccc', margin: '10px' }}>
      <h3>示例 5：跨组件同步</h3>
      <p>计数器：{count}</p>
      <button onClick={() => setCount(count + 1)}>增加</button>
      <button onClick={() => setCount(count - 1)}>减少</button>
      <button onClick={() => setCount(0)}>重置</button>
      <p style={{ color: '#666', fontSize: '12px' }}>
        打开多个组件实例，它们会自动同步
      </p>
    </div>
  );
}

/**
 * 完整示例页面
 */
export function StorageExamplesPage() {
  return (
    <div style={{ padding: '20px' }}>
      <h1>存储服务使用示例</h1>
      
      <StorageBasicExample />
      <StorageHookExample />
      <StorageReadOnlyExample />
      <StorageByPrefixExample />
      <StorageSyncExample />
      
      <div style={{ marginTop: '20px', padding: '10px', background: '#e3f2fd' }}>
        <h4>使用建议：</h4>
        <ul>
          <li>✅ 推荐使用 <code>useStorage</code> Hook，语法最简洁</li>
          <li>✅ 键命名使用点分隔：<code>user.name</code>, <code>ui.theme</code></li>
          <li>✅ 总是提供默认值</li>
          <li>⚠️ 避免存储大量数据（Chrome 有配额限制）</li>
          <li>⚠️ 不要存储敏感信息（如密码）</li>
        </ul>
      </div>
    </div>
  );
}
