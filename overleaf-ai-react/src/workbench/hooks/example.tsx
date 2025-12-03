/**
 * React Service Hooks 使用示例
 */

import React, { useState } from 'react';
import { DIProvider } from '../context/DIContext';
import { useService, useServiceEvent } from './index';
import { InstantiationService, ServiceDescriptor } from '../../platform/instantiation';
import { IEditorServiceId } from '../../platform/editor/editor';
import type { IEditorService } from '../../platform/editor/editor';

// ============================================
// 示例 1：基础使用 - 调用服务方法
// ============================================

function FileNameButton() {
  const editorService = useService<IEditorService>(IEditorServiceId);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleClick = async () => {
    const name = await editorService.getCurrentFileName();
    setFileName(name);
  };

  return (
    <div>
      <button onClick={handleClick}>Get File Name</button>
      {fileName && <p>Current file: {fileName}</p>}
    </div>
  );
}

// ============================================
// 示例 2：自动订阅事件 - 实时更新
// ============================================

function ActiveFileDisplay() {
  const editorService = useService<IEditorService>(IEditorServiceId);
  
  // 自动订阅文件变化事件，文件切换时自动更新
  const currentFile = useServiceEvent(
    editorService.onDidChangeActiveFile,
    null // 初始值
  );

  return (
    <div>
      <h3>Active File</h3>
      <p>{currentFile || 'No file selected'}</p>
    </div>
  );
}

// ============================================
// 示例 3：读取文件内容
// ============================================

function FileContentViewer() {
  const editorService = useService<IEditorService>(IEditorServiceId);
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const loadContent = async () => {
    setLoading(true);
    try {
      const text = await editorService.getEditorFullText();
      setContent(text);
    } catch (error) {
      console.error('Failed to load content:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button onClick={loadContent} disabled={loading}>
        {loading ? 'Loading...' : 'Load Content'}
      </button>
      {content && (
        <pre style={{ maxHeight: '300px', overflow: 'auto' }}>
          {content}
        </pre>
      )}
    </div>
  );
}

// ============================================
// 示例 4：文件树显示
// ============================================

function FileTreePanel() {
  const editorService = useService<IEditorService>(IEditorServiceId);
  const [files, setFiles] = useState<any[]>([]);

  const loadFileTree = async () => {
    const tree = await editorService.readFileTree();
    setFiles(tree);
  };

  React.useEffect(() => {
    loadFileTree();
  }, []);

  return (
    <div>
      <h3>File Tree</h3>
      <button onClick={loadFileTree}>Refresh</button>
      <ul>
        {files.map((file, index) => (
          <li key={index} style={{ paddingLeft: `${file.level * 20}px` }}>
            {file.type === 'folder' ? '📁' : '📄'} {file.name}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ============================================
// 示例 5：组合多个服务
// ============================================

/**
 * 假设有一个 LogService
 */
// import { ILogServiceId } from '../../platform/log/log';

function DashboardPanel() {
  const editorService = useService<IEditorService>(IEditorServiceId);
  // const logService = useService(ILogServiceId);
  
  const currentFile = useServiceEvent(
    editorService.onDidChangeActiveFile,
    null
  );

  const [stats, setStats] = useState({ lines: 0, words: 0 });

  React.useEffect(() => {
    if (currentFile) {
      // logService.log(`File changed: ${currentFile}`);
      
      // 计算统计信息
      (async () => {
        const content = await editorService.getEditorFullText();
        const lines = content.split('\n').length;
        const words = content.split(/\s+/).length;
        setStats({ lines, words });
      })();
    }
  }, [currentFile, editorService]);

  return (
    <div>
      <h2>Dashboard</h2>
      <p>Current File: {currentFile || 'None'}</p>
      <p>Lines: {stats.lines}</p>
      <p>Words: {stats.words}</p>
    </div>
  );
}

// ============================================
// 示例 6：应用根组件 - 提供 DI 容器
// ============================================

export function AppWithDI() {
  // 创建 DI 容器（通常在应用入口创建一次）
  const [container] = useState(() => {
    const di = new InstantiationService();
    
    // 注册服务
    // 实际使用中，应该根据环境注册不同的实现
    // Content Script: OverleafEditorService
    // Sidepanel: EditorServiceProxy
    
    // di.registerDescriptor(
    //   new ServiceDescriptor(IEditorServiceId, OverleafEditorService)
    // );
    
    return di;
  });

  return (
    <DIProvider container={container}>
      <div style={{ padding: '20px' }}>
        <h1>Overleaf AI Assistant</h1>
        <ActiveFileDisplay />
        <hr />
        <FileNameButton />
        <hr />
        <FileContentViewer />
        <hr />
        <FileTreePanel />
        <hr />
        <DashboardPanel />
      </div>
    </DIProvider>
  );
}

// ============================================
// 示例 7：自定义 Hook 封装
// ============================================

/**
 * 自定义 Hook：获取当前文件信息
 */
function useCurrentFile() {
  const editorService = useService<IEditorService>(IEditorServiceId);
  const fileName = useServiceEvent(
    editorService.onDidChangeActiveFile,
    null
  );
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const loadContent = React.useCallback(async () => {
    if (!fileName) return;
    
    setLoading(true);
    try {
      const text = await editorService.getEditorFullText();
      setContent(text);
    } finally {
      setLoading(false);
    }
  }, [fileName, editorService]);

  React.useEffect(() => {
    loadContent();
  }, [loadContent]);

  return { fileName, content, loading, reload: loadContent };
}

/**
 * 使用自定义 Hook
 */
function SmartFileViewer() {
  const { fileName, content, loading, reload } = useCurrentFile();

  return (
    <div>
      <h3>{fileName || 'No file'}</h3>
      <button onClick={reload} disabled={loading}>
        {loading ? 'Loading...' : 'Reload'}
      </button>
      {content && <pre>{content.slice(0, 500)}...</pre>}
    </div>
  );
}

// ============================================
// 使用说明
// ============================================

/**
 * 在实际应用中的集成步骤：
 * 
 * 1. 在应用入口创建 DI 容器并注册服务
 * 2. 使用 DIProvider 包裹应用根组件
 * 3. 在组件中使用 useService 获取服务
 * 4. 使用 useServiceEvent 自动订阅事件
 * 5. 组件卸载时自动清理订阅（无需手动处理）
 * 
 * 优势：
 * - ✅ 类型安全：完整的 TypeScript 支持
 * - ✅ 自动清理：防止内存泄漏
 * - ✅ 测试友好：可以轻松 Mock 服务
 * - ✅ 解耦：UI 不依赖具体实现
 * - ✅ 可扩展：轻松添加新服务
 */
