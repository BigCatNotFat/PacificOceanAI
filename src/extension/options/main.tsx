import '../../utils/silenceConsole';
import React from 'react';
import ReactDOM from 'react-dom/client';
import OptionsApp from '../../workbench/parts/OptionsApp';
import { DIProvider } from '../../workbench/context/DIContext';
import { InstantiationService, ServiceDescriptor, getServiceDependencies } from '../../platform/instantiation';
import { IStorageServiceId } from '../../platform/storage/storage';
import { StorageService } from '../../services/storage/StorageService';
import { IConfigurationServiceId } from '../../platform/configuration/configuration';
import { ConfigurationService } from '../../services/configuration/ConfigurationService';
import { StorageScope } from '../../base/browser/storage';

/**
 * Options 页面入口
 * 初始化 DI 容器并将 OptionsApp 组件挂载到 DOM
 */

// 创建 DI 容器
const di = new InstantiationService();

// 注册存储服务（使用 local 存储，支持更大的数据量）
const storageService = new StorageService(StorageScope.LOCAL);
di.registerInstance(IStorageServiceId, storageService);

// 注册配置服务（读取 @injectable 装饰器中的依赖）
di.registerDescriptor(
  new ServiceDescriptor(
    IConfigurationServiceId, 
    ConfigurationService,
    getServiceDependencies(ConfigurationService)
  )
);

const root = document.getElementById('options-root');

if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <DIProvider container={di}>
        <OptionsApp />
      </DIProvider>
    </React.StrictMode>
  );
}
