import React, { useEffect, useState, useCallback } from 'react';
import { useService } from '../hooks/useService';
import { SIDEBAR_CONFIG } from '../../base/common/constants';
import { getMainContainer, setTransition, triggerResize } from '../../base/browser/dom';
import Sidebar from './Sidebar';
import ToolbarButtonPortal from './ToolbarButtonPortal';
import TextActionProvider from './TextActionProvider';
import { DIProvider } from '../context/DIContext';
import { InstantiationService, ServiceDescriptor, getServiceDependencies } from '../../platform/instantiation';
import { IConfigurationServiceId } from '../../platform/configuration/configuration';
import { ConfigurationService } from '../../services/configuration/ConfigurationService';
import { IStorageServiceId } from '../../platform/storage/storage';
import { StorageService } from '../../services/storage/StorageService';
import { StorageScope } from '../../base/browser/storage';
import { ChatService, IChatServiceId } from '../../services/agent/ChatService';
import { AgentService, IAgentServiceId } from '../../services/agent/AgentService';
import { ConversationService, IConversationServiceId } from '../../services/agent/ConversationService';
import { LLMService, ILLMServiceId } from '../../services/llm/LLMService';
import { PromptService, IPromptServiceId } from '../../services/agent/PromptService';
import { ToolService, IToolServiceId } from '../../services/agent/ToolService';
import { ModelRegistryService, IModelRegistryServiceId } from '../../services/llm/ModelRegistryService';
import { UIStreamService, IUIStreamServiceId } from '../../services/agent/UIStreamService';
import { TextActionAIService, ITextActionAIServiceId } from '../../services/agent/TextActionAIService';
import { useModelListSync } from '../hooks/useModelListSync';
import { diffSuggestionService } from '../../services/editor/DiffSuggestionService';
import { LiteratureService, ILiteratureServiceId } from '../../services/literature/LiteratureService';
import type { ILiteratureService } from '../../platform/literature/ILiteratureService';
import { overleafEditor } from '../../services/editor/OverleafEditor';

const App: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentWidth, setCurrentWidth] = useState(SIDEBAR_CONFIG.DEFAULT_WIDTH);

  // 初始化 DI 容器（只创建一次）
  const [container] = useState(() => {
    const di = new InstantiationService();
    
    // 注册存储服务（手动创建实例）
    const storageService = new StorageService(StorageScope.LOCAL);
    di.registerInstance(IStorageServiceId, storageService);
    
    // 注册配置服务（使用 ServiceDescriptor 自动解析依赖）
    di.registerDescriptor(
      new ServiceDescriptor(
        IConfigurationServiceId,
        ConfigurationService,
        getServiceDependencies(ConfigurationService)
      )
    );

    // 注册模型注册表服务（基础服务，无依赖）
    di.registerDescriptor(
      new ServiceDescriptor(
        IModelRegistryServiceId,
        ModelRegistryService,
        getServiceDependencies(ModelRegistryService)
      )
    );

    // 注册工具服务（基础服务，无依赖）
    di.registerDescriptor(
      new ServiceDescriptor(
        IToolServiceId,
        ToolService,
        getServiceDependencies(ToolService)
      )
    );

    // 注册 UI 流式更新服务（基础服务，无依赖）
    di.registerDescriptor(
      new ServiceDescriptor(
        IUIStreamServiceId,
        UIStreamService,
        getServiceDependencies(UIStreamService)
      )
    );

    // 注册 Prompt 服务
    di.registerDescriptor(
      new ServiceDescriptor(
        IPromptServiceId,
        PromptService,
        getServiceDependencies(PromptService)
      )
    );

    // 注册 LLM 服务
    di.registerDescriptor(
      new ServiceDescriptor(
        ILLMServiceId,
        LLMService,
        getServiceDependencies(LLMService)
      )
    );

    // 注册 Agent 服务（依赖 LLMService, PromptService, ToolService, ModelRegistryService）
    di.registerDescriptor(
      new ServiceDescriptor(
        IAgentServiceId,
        AgentService,
        getServiceDependencies(AgentService)
      )
    );

    // 注册对话历史管理服务（依赖 StorageService）
    di.registerDescriptor(
      new ServiceDescriptor(
        IConversationServiceId,
        ConversationService,
        getServiceDependencies(ConversationService)
      )
    );

    // 注册 Chat 服务（依赖 AgentService, ConversationService）
    di.registerDescriptor(
      new ServiceDescriptor(
        IChatServiceId,
        ChatService,
        getServiceDependencies(ChatService)
      )
    );

    // 注册 TextActionAI 服务（依赖 LLMService, PromptService, ConfigurationService, ModelRegistryService, UIStreamService）
    di.registerDescriptor(
      new ServiceDescriptor(
        ITextActionAIServiceId,
        TextActionAIService,
        getServiceDependencies(TextActionAIService)
      )
    );

    // 注册文献管理服务（基础服务，无依赖）
    di.registerDescriptor(
      new ServiceDescriptor(
        ILiteratureServiceId,
        LiteratureService,
        getServiceDependencies(LiteratureService)
      )
    );

    // 延迟自动同步文献（确保注入脚本已加载）
    // 使用 initializeWithSync 进行本地库和 bib 文件的同步
    setTimeout(() => {
      const literatureService = di.getService<ILiteratureService>(ILiteratureServiceId);
      literatureService.initializeWithSync().then((result) => {
        console.log(`[App] 文献库同步完成: ${result.references.length} 篇`);
        if (result.errors.length > 0) {
          console.warn('[App] 文献库同步警告:', result.errors);
        }
      }).catch((err) => {
        console.warn('[App] 文献库同步失败:', err);
      });
    }, 1000);

    return di;
  });

  useEffect(() => {
    const mainContainer = getMainContainer();
    if (!mainContainer) return;

    setTransition(mainContainer, 'width 0.2s ease', SIDEBAR_CONFIG.ANIMATION_DURATION);
    if (isOpen) {
      mainContainer.style.width = `calc(100% - ${currentWidth}px)`;
    } else {
      mainContainer.style.width = '';
    }

    const timer = window.setTimeout(() => {
      triggerResize();
    }, SIDEBAR_CONFIG.ANIMATION_DURATION);

    return () => window.clearTimeout(timer);
  }, [isOpen, currentWidth]);

  const toggleSidebar = () => setIsOpen((prev) => !prev);
  const closeSidebar = () => setIsOpen(false);

  return (
    <DIProvider container={container}>
      <ModelListSyncProvider />
      <CiteLookupProvider />
      <TextActionProvider showStatusToast>
        <ToolbarButtonPortal onClick={toggleSidebar} />
        <Sidebar
          isOpen={isOpen}
          width={currentWidth}
          onToggle={toggleSidebar}
          onClose={closeSidebar}
          onWidthChange={setCurrentWidth}
        />
      </TextActionProvider>
    </DIProvider>
  );
};

/**
 * 模型列表同步组件
 * 负责将 ModelRegistryService 中的模型列表推送到 OverleafBridge
 */
const ModelListSyncProvider: React.FC = () => {
  useModelListSync();
  return null;
};

/**
 * 引用查找监听组件
 * 负责响应注入脚本的引用查找请求
 */
const CiteLookupProvider: React.FC = () => {
  const literatureService = useService<ILiteratureService>(ILiteratureServiceId);
  
  useEffect(() => {
    if (!literatureService) return;
    
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== window) return;
      
      const data = event.data;
      if (!data || data.type !== 'OVERLEAF_CITE_LOOKUP_REQUEST') return;
      
      const { requestId, keys } = data;
      if (!requestId || !Array.isArray(keys)) return;
      
      // 从文献服务中查找引用
      const allRefs = literatureService.getReferences();
      const foundRefs = keys.map(key => 
        allRefs.find(ref => ref.id === key) || null
      ).filter(Boolean);
      
      // 发送响应
      window.postMessage({
        type: 'OVERLEAF_CITE_LOOKUP_RESPONSE',
        requestId,
        references: foundRefs
      }, '*');
    };
    
    window.addEventListener('message', handleMessage);
    
    // 当文献列表更新时，推送到注入脚本
    const disposable = literatureService.onDidReferencesChange((refs) => {
      window.postMessage({
        type: 'OVERLEAF_REFERENCES_UPDATE',
        references: refs
      }, '*');
    });
    
    return () => {
      window.removeEventListener('message', handleMessage);
      disposable.dispose();
    };
  }, [literatureService]);
  
  return null;
};

export default App;

