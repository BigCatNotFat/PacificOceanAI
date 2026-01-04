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
import { LLMService, ILLMServiceId } from '../../services/llm/LLMService';
import { PromptService, IPromptServiceId } from '../../services/agent/PromptService';
import { ToolService, IToolServiceId } from '../../services/agent/ToolService';
import { ModelRegistryService, IModelRegistryServiceId } from '../../services/llm/ModelRegistryService';
import { UIStreamService, IUIStreamServiceId } from '../../services/agent/UIStreamService';

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

    // 注册 Chat 服务（依赖 AgentService）
    di.registerDescriptor(
      new ServiceDescriptor(
        IChatServiceId,
        ChatService,
        getServiceDependencies(ChatService)
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

export default App;

