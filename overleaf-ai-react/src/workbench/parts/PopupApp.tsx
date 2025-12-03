import React from 'react';

/**
 * Popup 弹出面板主组件
 * 当用户点击浏览器插件图标时显示
 */
const PopupApp: React.FC = () => {
  // 打开 Overleaf 页面
  const openOverleaf = () => {
    chrome.tabs.create({ url: 'https://www.overleaf.com/project' });
  };

  // 打开设置页面
  const openSettings = () => {
    // 打开独立的设置页面
    chrome.runtime.openOptionsPage();
  };

  // 发送消息到当前标签页
  const sendMessageToPage = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab.id) {
        await chrome.tabs.sendMessage(tab.id, { type: 'POPUP_MESSAGE', data: 'Hello from popup!' });
        alert('消息已发送到页面');
      }
    } catch (error) {
      console.error('发送消息失败:', error);
      alert('发送消息失败，请确保在 Overleaf 页面上');
    }
  };

  return (
    <div className="popup-container">
      {/* Header */}
      <div className="popup-header">
        <h1 className="popup-title">Overleaf AI Assistant</h1>
        <p className="popup-subtitle">智能写作助手</p>
      </div>

      {/* Content */}
      <div className="popup-content">
        <div className="popup-section">
          <h2 className="section-title">快速操作</h2>
          
          {/* 功能按钮列表 */}
          <div className="button-group">
            <button className="popup-button primary" onClick={openOverleaf}>
              <span className="button-icon">📝</span>
              <span className="button-text">打开 Overleaf</span>
            </button>

            <button className="popup-button secondary" onClick={sendMessageToPage}>
              <span className="button-icon">💬</span>
              <span className="button-text">发送测试消息</span>
            </button>

            <button className="popup-button secondary" onClick={openSettings}>
              <span className="button-icon">⚙️</span>
              <span className="button-text">打开设置</span>
            </button>
          </div>

          {/* 统计信息 */}
          <div className="popup-stats">
            <div className="stat-item">
              <span className="stat-label">使用次数</span>
              <span className="stat-value">0</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">活跃项目</span>
              <span className="stat-value">0</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="popup-footer">
        <p className="footer-text">Version 1.0.0</p>
      </div>
    </div>
  );
};

export default PopupApp;
