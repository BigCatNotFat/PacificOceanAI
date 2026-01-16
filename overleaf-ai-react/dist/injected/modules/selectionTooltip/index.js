/**
 * 选区工具提示模块 - 统一导出
 * 注意：此模块包含大量UI和交互逻辑，将在构建时从原始文件提取完整代码
 */

// 选区操作按钮配置
var SELECTION_ACTION_BUTTONS = [
  { id: 'expand',    label: '扩写', icon: '', bgColor: '#10b981', hoverColor: '#059669' },
  { id: 'condense',  label: '缩写', icon: '', bgColor: '#f59e0b', hoverColor: '#d97706' },
  { id: 'polish',    label: '润色', icon: '', bgColor: '#3b82f6', hoverColor: '#2563eb' },
  { id: 'translate', label: '翻译', icon: '', bgColor: '#8b5cf6', hoverColor: '#7c3aed' }
];

// 注意：完整的tooltip、actions、positioning代码将在构建时添加
// 这些模块包含数千行代码，需要从原始文件中提取

// 导出配置
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { 
    SELECTION_ACTION_BUTTONS
    // 其他导出将在构建时添加
  };
}

