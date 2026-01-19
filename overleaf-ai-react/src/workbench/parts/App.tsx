import React, { useEffect, useState } from 'react';
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
import { TelemetryService } from '../../services/telemetry/TelemetryService';
import { ITelemetryServiceId } from '../../platform/telemetry/ITelemetryService';
import { diffSuggestionService } from '../../services/editor/DiffSuggestionService';
import { API_ENDPOINTS } from '../../base/common/apiConfig';

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

    // 注册统计服务（基础服务，依赖 StorageService）
    di.registerDescriptor(
      new ServiceDescriptor(
        ITelemetryServiceId,
        TelemetryService,
        getServiceDependencies(TelemetryService)
      )
    );

    // 配置统计服务并记录会话开始
    const telemetryService = di.getService<TelemetryService>(ITelemetryServiceId);
    telemetryService.configure({
      endpoint: API_ENDPOINTS.TELEMETRY,
      version: '1.0.0', // TODO: 从 manifest 获取版本号
      uploadInterval: 120000, // 120 秒上报一次
    });
    telemetryService.trackSessionStart();

    // 手动注入统计服务到 DiffSuggestionService（单例模式）
    diffSuggestionService.setTelemetryService(telemetryService);

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

export default App;

