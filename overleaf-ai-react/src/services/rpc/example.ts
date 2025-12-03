/**
 * RPC 系统使用示例
 */

import { ChromeRuntimeChannel } from '../../base/common/rpcChannel';
import { RPCServer } from './RPCServer';
import { RPCClient } from './RPCClient';
import { OverleafEditorService } from '../editor/OverleafEditorService';
import { EditorServiceProxy } from '../editor/EditorServiceProxy';

// ============================================
// Content Script 端 - RPC 服务器
// ============================================

/**
 * 在 Content Script 中启动 RPC 服务器
 * 将 OverleafEditorService 的方法暴露给 Sidepanel
 */
export function setupRPCServerInContentScript() {
  // 1. 创建通信通道
  const channel = new ChromeRuntimeChannel();

  // 2. 创建 RPC 服务器
  const rpcServer = new RPCServer(channel);

  // 3. 创建 EditorService 实例
  const editorService = new OverleafEditorService();

  // 4. 注册服务的所有方法
  rpcServer.registerService(editorService, [
    'getCurrentFileName',
    'readLine',
    'readAllLines',
    'getEditorFullText',
    'readFileOutline',
    'readFileTree',
    'readImagePreviewUrl'
  ]);

  // 或者手动注册单个方法
  // rpcServer.registerMethod('getCurrentFileName', () => editorService.getCurrentFileName());

  // 5. 启动服务器
  rpcServer.start();

  console.log('[Content Script] RPC Server is running');

  return { rpcServer, editorService };
}

// ============================================
// Sidepanel 端 - RPC 客户端
// ============================================

/**
 * 在 Sidepanel 中使用 RPC 客户端
 * 通过代理调用 Content Script 的 EditorService
 */
export async function setupRPCClientInSidepanel() {
  // 1. 创建通信通道
  const channel = new ChromeRuntimeChannel();

  // 2. 创建 RPC 客户端
  const rpcClient = new RPCClient(channel, { timeout: 30000 });

  // 3. 创建 EditorService 代理
  const editorService = new EditorServiceProxy(rpcClient);

  // 4. 使用代理调用方法（自动通过 RPC）
  try {
    const fileName = await editorService.getCurrentFileName();
    console.log('Current file:', fileName);

    const content = await editorService.getEditorFullText();
    console.log('File content length:', content.length);

    const fileTree = await editorService.readFileTree();
    console.log('File tree:', fileTree);

  } catch (error) {
    console.error('RPC call failed:', error);
  }

  return { rpcClient, editorService };
}

// ============================================
// 使用 DI 容器集成
// ============================================

/**
 * 在 Content Script 中使用 DI 容器
 */
export function setupRPCWithDIInContentScript() {
  import('../../platform/instantiation').then(({ InstantiationService, ServiceDescriptor }) => {
    import('../../platform/editor/editor').then(({ IEditorServiceId }) => {
      import('../../platform/rpc/rpc').then(({ IRPCServerID }) => {
        // 创建 DI 容器
        const di = new InstantiationService();

        // 注册通道
        const channel = new ChromeRuntimeChannel();

        // 注册 EditorService（真实实现）
        di.registerDescriptor(
          new ServiceDescriptor(IEditorServiceId, OverleafEditorService)
        );

        // 注册 RPC Server
        di.registerInstance(IRPCServerID, new RPCServer(channel));

        // 获取服务并启动
        const rpcServer = di.getService(IRPCServerID) as RPCServer;
        const editorService = di.getService(IEditorServiceId);
        
        rpcServer.registerService(editorService);
        rpcServer.start();

        console.log('[Content Script] RPC with DI is ready');
      });
    });
  });
}

/**
 * 在 Sidepanel 中使用 DI 容器
 */
export function setupRPCWithDIInSidepanel() {
  import('../../platform/instantiation').then(({ InstantiationService, ServiceDescriptor }) => {
    import('../../platform/editor/editor').then(({ IEditorServiceId }) => {
      import('../../platform/rpc/rpc').then(({ IRPCClientID }) => {
        // 创建 DI 容器
        const di = new InstantiationService();

        // 注册通道和 RPC 客户端
        const channel = new ChromeRuntimeChannel();
        const rpcClient = new RPCClient(channel);
        di.registerInstance(IRPCClientID, rpcClient);

        // 注册 EditorService（代理实现）
        di.registerDescriptor(
          new ServiceDescriptor(IEditorServiceId, EditorServiceProxy, [IRPCClientID])
        );

        // 获取服务（自动创建代理）
        const editorService = di.getService(IEditorServiceId);

        console.log('[Sidepanel] RPC with DI is ready');
        
        return editorService;
      });
    });
  });
}
