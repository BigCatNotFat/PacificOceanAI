import React, { useState, useEffect } from 'react';

/**
 * Options 设置页面主组件
 * 在独立的标签页中显示完整的设置界面
 */
const OptionsApp: React.FC = () => {
  const [settings, setSettings] = useState({
    autoStart: false,
    notifications: true,
    theme: 'auto',
    apiKey: '',
    language: 'zh-CN',
    fontSize: 14,
  });

  const [saved, setSaved] = useState(false);

  // 加载保存的设置
  useEffect(() => {
    chrome.storage.sync.get(['settings'], (result) => {
      if (result.settings) {
        setSettings({ ...settings, ...result.settings });
      }
    });
  }, []);

  // 保存设置
  const saveSettings = () => {
    chrome.storage.sync.set({ settings }, () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  };

  // 更新单个设置项
  const updateSetting = (key: string, value: any) => {
    setSettings({ ...settings, [key]: value });
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <h1 style={styles.title}>Overleaf AI Assistant 设置</h1>
        <p style={styles.subtitle}>配置你的智能写作助手</p>
      </header>

      {/* Main Content */}
      <main style={styles.main}>
        {/* General Settings Section */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>⚙️ 通用设置</h2>
          
          <div style={styles.settingItem}>
            <label style={styles.settingLabel}>
              <input
                type="checkbox"
                checked={settings.autoStart}
                onChange={(e) => updateSetting('autoStart', e.target.checked)}
                style={styles.checkbox}
              />
              <span style={styles.settingText}>自动启动助手</span>
            </label>
            <p style={styles.settingDescription}>
              在打开 Overleaf 页面时自动激活 AI 助手功能
            </p>
          </div>

          <div style={styles.settingItem}>
            <label style={styles.settingLabel}>
              <input
                type="checkbox"
                checked={settings.notifications}
                onChange={(e) => updateSetting('notifications', e.target.checked)}
                style={styles.checkbox}
              />
              <span style={styles.settingText}>显示通知</span>
            </label>
            <p style={styles.settingDescription}>
              接收重要的操作提示和状态更新
            </p>
          </div>
        </section>

        {/* Appearance Section */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>🎨 外观设置</h2>
          
          <div style={styles.settingItem}>
            <label style={styles.settingLabelBlock}>
              <span style={styles.settingText}>主题</span>
              <select
                value={settings.theme}
                onChange={(e) => updateSetting('theme', e.target.value)}
                style={styles.select}
              >
                <option value="light">浅色</option>
                <option value="dark">深色</option>
                <option value="auto">跟随系统</option>
              </select>
            </label>
            <p style={styles.settingDescription}>
              选择你喜欢的界面主题风格
            </p>
          </div>

          <div style={styles.settingItem}>
            <label style={styles.settingLabelBlock}>
              <span style={styles.settingText}>字体大小</span>
              <input
                type="number"
                min="12"
                max="20"
                value={settings.fontSize}
                onChange={(e) => updateSetting('fontSize', parseInt(e.target.value))}
                style={styles.numberInput}
              />
            </label>
            <p style={styles.settingDescription}>
              调整界面文字的显示大小（12-20px）
            </p>
          </div>
        </section>

        {/* AI Settings Section */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>🤖 AI 设置</h2>
          
          <div style={styles.settingItem}>
            <label style={styles.settingLabelBlock}>
              <span style={styles.settingText}>API Key</span>
              <input
                type="password"
                value={settings.apiKey}
                onChange={(e) => updateSetting('apiKey', e.target.value)}
                placeholder="请输入你的 API Key"
                style={styles.textInput}
              />
            </label>
            <p style={styles.settingDescription}>
              配置 AI 服务的访问密钥
            </p>
          </div>

          <div style={styles.settingItem}>
            <label style={styles.settingLabelBlock}>
              <span style={styles.settingText}>语言</span>
              <select
                value={settings.language}
                onChange={(e) => updateSetting('language', e.target.value)}
                style={styles.select}
              >
                <option value="zh-CN">简体中文</option>
                <option value="zh-TW">繁体中文</option>
                <option value="en-US">English</option>
              </select>
            </label>
            <p style={styles.settingDescription}>
              设置界面和 AI 回复的语言
            </p>
          </div>
        </section>

        {/* Save Button */}
        <div style={styles.actionBar}>
          <button
            onClick={saveSettings}
            style={{
              ...styles.saveButton,
              ...(saved ? styles.saveButtonSuccess : {})
            }}
          >
            {saved ? '✓ 已保存' : '保存设置'}
          </button>
        </div>
      </main>

      {/* Footer */}
      <footer style={styles.footer}>
        <p style={styles.footerText}>Overleaf AI Assistant v1.0.0</p>
        <p style={styles.footerText}>
          <a href="https://github.com" style={styles.link} target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
          {' · '}
          <a href="#" style={styles.link}>帮助文档</a>
        </p>
      </footer>
    </div>
  );
};

// Inline styles
const styles: { [key: string]: React.CSSProperties } = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#f5f5f5',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif',
  },
  header: {
    backgroundColor: '#4a90e2',
    color: 'white',
    padding: '40px 20px',
    textAlign: 'center',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  title: {
    margin: '0 0 10px 0',
    fontSize: '32px',
    fontWeight: '600',
  },
  subtitle: {
    margin: 0,
    fontSize: '16px',
    opacity: 0.9,
  },
  main: {
    maxWidth: '800px',
    margin: '0 auto',
    padding: '40px 20px',
  },
  section: {
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '30px',
    marginBottom: '20px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  sectionTitle: {
    margin: '0 0 25px 0',
    fontSize: '20px',
    fontWeight: '600',
    color: '#333',
    borderBottom: '2px solid #4a90e2',
    paddingBottom: '10px',
  },
  settingItem: {
    marginBottom: '25px',
  },
  settingLabel: {
    display: 'flex',
    alignItems: 'center',
    cursor: 'pointer',
  },
  settingLabelBlock: {
    display: 'block',
  },
  settingText: {
    fontSize: '16px',
    fontWeight: '500',
    color: '#333',
    marginBottom: '8px',
    display: 'block',
  },
  settingDescription: {
    margin: '8px 0 0 0',
    fontSize: '14px',
    color: '#666',
    lineHeight: '1.5',
  },
  checkbox: {
    width: '18px',
    height: '18px',
    marginRight: '10px',
    cursor: 'pointer',
  },
  select: {
    width: '100%',
    padding: '10px',
    fontSize: '14px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    backgroundColor: 'white',
    cursor: 'pointer',
  },
  textInput: {
    width: '100%',
    padding: '10px',
    fontSize: '14px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    boxSizing: 'border-box',
  },
  numberInput: {
    width: '100px',
    padding: '10px',
    fontSize: '14px',
    border: '1px solid #ddd',
    borderRadius: '4px',
  },
  actionBar: {
    textAlign: 'center',
    marginTop: '40px',
  },
  saveButton: {
    padding: '12px 40px',
    fontSize: '16px',
    fontWeight: '600',
    color: 'white',
    backgroundColor: '#4a90e2',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  saveButtonSuccess: {
    backgroundColor: '#28a745',
  },
  footer: {
    textAlign: 'center',
    padding: '30px 20px',
    color: '#666',
  },
  footerText: {
    margin: '5px 0',
    fontSize: '14px',
  },
  link: {
    color: '#4a90e2',
    textDecoration: 'none',
  },
};

export default OptionsApp;
