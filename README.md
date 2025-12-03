# Overleaf AI 助手

一个为 Overleaf 添加 AI 助手功能的浏览器扩展。

## � 快速开始

### 方式一：使用打包版本（推荐）

当前 `manifest.json` 配置为使用打包版本 `content-bundle.js`，这是最简单稳定的方式。

1. 打开 Chrome: `chrome://extensions/`
2. 启用"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择项目根目录
5. 访问 [Overleaf](https://www.overleaf.com) 测试

### 方式二：使用模块化版本（开发推荐）

如果你想使用 ES6 模块进行开发，需要修改 `manifest.json`:

```json
{
  "content_scripts": [
    {
      "matches": ["https://www.overleaf.com/*"],
      "js": ["src/main/content.js"],
      "type": "module"
    }
  ],
  "web_accessible_resources": [
    {
      "resources": ["src/**/*.js", "src/**/*.css"],
      "matches": ["https://www.overleaf.com/*"]
    }
  ]
}
```

**注意**: ES6 模块需要 Chrome 91+ 版本支持。

## � 项目结构

```
overleaf-agent/
├── src/                     # 模块化源代码（开发用）
│   ├── styles/              # 样式文件
│   │   └── sidebar.css      # 侧边栏样式
│   ├── config/              # 配置文件
│   │   └── constants.js     # 常量配置
│   ├── utils/               # 工具函数
│   │   ├── dom.js           # DOM 操作工具
│   │   └── resize.js        # 拖拽调整大小
│   ├── components/          # UI 组件
│   │   ├── sidebar.js       # 侧边栏组件
│   │   └── button.js        # 工具栏按钮组件
│   └── main/                # 主入口
│       └── content.js       # 内容脚本入口
├── content-bundle.js        # 打包版本（生产用）✨
├── manifest.json            # 扩展配置文件
└── README.md               # 项目说明文档
```

## 🏗️ 架构说明

### 1. **样式层 (styles/)**
- `sidebar.css`: 完整的侧边栏 UI 样式，模仿 Overleaf 原生设计风格

### 2. **配置层 (config/)**
- `constants.js`: 集中管理所有常量配置，包括：
  - 侧边栏尺寸配置
  - 元素 ID 和类名
  - CSS 选择器
  - 样式类名

### 3. **工具层 (utils/)**
- `dom.js`: 提供 DOM 操作的通用工具函数
  - 获取主容器
  - 控制 iframe 鼠标事件
  - 触发窗口 resize
  - 注入样式等

- `resize.js`: 处理侧边栏拖拽调整大小的逻辑
  - 初始化拖拽事件
  - 边界限制
  - 实时更新宽度

### 4. **组件层 (components/)**
- `sidebar.js`: 侧边栏组件（类模式）
  - 管理侧边栏的打开/关闭状态
  - 渲染 UI 模板
  - 处理聊天交互
  - 绑定事件处理器

- `button.js`: 工具栏按钮组件（类模式）
  - 创建和注入按钮
  - 监听 DOM 变化（MutationObserver）
  - 自动重新注入按钮

### 5. **主入口 (main/)**
- `content.js`: 应用主入口
  - 初始化整个应用
  - 协调各个模块
  - 处理生命周期

## 🚀 功能特性

- ✅ **模块化架构**: 使用 ES6 模块，代码结构清晰
- ✅ **类组件设计**: 使用面向对象的方式管理组件
- ✅ **原生风格 UI**: 完美复刻 Overleaf 的界面设计
- ✅ **拖拽调整**: 支持拖拽调整侧边栏宽度
- ✅ **自动注入**: 智能监听 DOM 变化，自动注入按钮
- ✅ **聊天交互**: 基础的聊天界面（可扩展 AI 功能）

## 🔧 开发说明

### 安装扩展

1. 打开 Chrome 扩展管理页面: `chrome://extensions/`
2. 启用"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择项目根目录

### 代码规范

- 使用 ES6+ 语法
- 采用模块化开发
- 类名使用 PascalCase
- 函数名使用 camelCase
- 常量使用 UPPER_SNAKE_CASE
- 详细的 JSDoc 注释

### 扩展开发

如果需要添加新功能：

1. **添加新组件**: 在 `src/components/` 创建新文件
2. **添加新工具**: 在 `src/utils/` 创建新文件
3. **修改样式**: 编辑 `src/styles/sidebar.css`
4. **添加配置**: 在 `src/config/constants.js` 添加配置项
5. **更新打包文件**: 修改后需要手动更新 `content-bundle.js`

### 开发工作流

**在模块化版本中开发（推荐）:**

1. 修改 `manifest.json` 使用 ES6 模块版本
2. 在 `src/` 目录中修改代码
3. 重新加载扩展测试
4. 完成后，将所有代码合并到 `content-bundle.js`
5. 改回 `manifest.json` 使用打包版本

**直接在打包版本中开发:**

- 直接修改 `content-bundle.js`
- 适合快速修复和小改动
- 不需要切换配置

### 调试技巧

1. 打开 Overleaf 页面的开发者工具（F12）
2. 查看 Console 选项卡，应该看到 "✅ Overleaf AI 助手已加载"
3. 检查是否有报错信息
4. 使用 `Sources` 选项卡设置断点调试

## 📝 待办事项

- [ ] 集成真实的 AI API
- [ ] 添加用户设置面板
- [ ] 支持多语言
- [ ] 添加快捷键支持
- [ ] 优化性能和内存使用
- [ ] 添加单元测试

## 📄 许可证

MIT License
