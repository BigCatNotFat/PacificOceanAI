import React, { useState } from 'react';

interface ActivationModalProps {
  isOpen: boolean;
  onSubmit: (code: string) => Promise<boolean>;
  onClose: () => void;
}

const AGREEMENTS = {
  USER: {
    title: '用户协议',
    content: `1. 服务内容
本服务（PacificOceanAI）是一个旨在辅助科研写作的智能工具。我们尽力提供准确的建议，但不保证结果的绝对正确性。用户应对使用生成内容产生的后果负责。

2. 用户行为
用户不得利用本服务生成违反法律法规、侵犯他人权益或有害的内容。我们保留在发现违规行为时暂停或终止服务的权利。

3. 知识产权
本服务的代码、设计及相关知识产权归开发者所有。用户使用本服务生成的内容（如润色后的文本）归用户所有。

4. 免责声明
本服务按"现状"提供，不包含任何明示或暗示的保证。对于因使用本服务而导致的任何直接或间接损失，开发者不承担责任。`
  },
  PRIVACY: {
    title: '隐私政策',
    content: `1. 数据收集
我们仅收集维持服务运行所必需的最少信息（如您的启动码）。您的具体对话内容（Prompt）会先发送到我们的服务器进行必要的转发处理，随后传输给大模型服务商。

2. 数据使用
您的数据仅用于提供 AI 辅助写作服务。我们承诺严格保障数据安全，不会保留您的对话内容，更不会将其用于任何非服务目的（如训练模型或出售给第三方）。

3. 数据安全
我们采取合理的技术手段保护您的数据安全。但请注意，互联网传输并非绝对安全，请勿在 Prompt 中包含敏感个人信息（如密码、身份证号等）。

4. 政策更新
我们可能会不时更新本隐私政策，更新后的政策将在新版本插件中生效。`
  }
};

const ActivationModal: React.FC<ActivationModalProps> = ({ isOpen, onSubmit, onClose }) => {
  const [activationCode, setActivationCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showAgreement, setShowAgreement] = useState<{title: string, content: string} | null>(null);

  if (!isOpen) return null;

  // 处理背景点击关闭
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activationCode.trim()) {
      setError('请输入启动码');
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      const success = await onSubmit(activationCode);
      if (!success) {
        setError('启动码验证失败，请重试');
      }
    } catch (err) {
      setError('验证过程出错');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.overlay} onClick={handleOverlayClick}>
      <div style={styles.modal}>
        <div style={styles.closeButtonWrapper}>
          <button onClick={onClose} style={styles.closeModalButton} title="关闭">✕</button>
        </div>
        <h2 style={styles.title}>欢迎使用 PacificOceanAI</h2>
        <p style={styles.subtitle}>请输入启动码以继续使用，关注公众号并回复启动码获取启动码</p>
        
        <div style={styles.qrContainer}>
          <div style={styles.qrPlaceholder}>
            {/* 
               请将二维码图片重命名为 qrcode.jpg 
               并放入 overleaf-ai-react/public/images/ 目录中
            */}
            <img 
              src={typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL 
                ? chrome.runtime.getURL('images/qrcode.jpg') 
                : '/images/qrcode.jpg'}
              alt="公众号二维码"
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              onError={(e) => {
                // 图片加载失败时显示图标
                e.currentTarget.style.display = 'none';
                e.currentTarget.parentElement!.querySelector('.fallback-icon')!.removeAttribute('style');
              }}
            />
            <div className="fallback-icon" style={{ display: 'none', flexDirection: 'column', alignItems: 'center' }}>
              <span className="material-symbols" style={{ fontSize: '48px', color: '#666' }}>qr_code_2</span>
              <p style={{ marginTop: '10px', color: '#666' }}>图片未找到<br/>请检查 public/images/qrcode.jpg</p>
            </div>
          </div>
          <p style={styles.qrText}>关注公众号 <span style={{ fontWeight: 'bold', color: '#333' }}>硅基之梦</span> 获取启动码</p>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.inputGroup}>
            <input
              type="text"
              value={activationCode}
              onChange={(e) => setActivationCode(e.target.value)}
              placeholder="请输入启动码"
              style={styles.input}
              disabled={loading}
            />
          </div>
          
          {error && <div style={styles.error}>{error}</div>}
          
          <button type="submit" style={styles.button} disabled={loading}>
            {loading ? '验证中...' : '开始使用'}
          </button>

          <div style={styles.agreement}>
            开始使用即代表同意 
            <span onClick={() => setShowAgreement(AGREEMENTS.USER)} style={styles.link}>用户协议</span> 
            和 
            <span onClick={() => setShowAgreement(AGREEMENTS.PRIVACY)} style={styles.link}>隐私政策</span>
          </div>
        </form>
      </div>

      {showAgreement && (
        <div style={styles.policyOverlay}>
          <div style={styles.policyModal}>
            <div style={styles.policyHeader}>
              <h3 style={styles.policyTitle}>{showAgreement.title}</h3>
              <button 
                onClick={() => setShowAgreement(null)}
                style={styles.closeButton}
              >
                ✕
              </button>
            </div>
            <div style={styles.policyContent}>
              <pre style={styles.policyText}>{showAgreement.content}</pre>
            </div>
            <div style={styles.policyFooter}>
              <button 
                onClick={() => setShowAgreement(null)}
                style={styles.confirmButton}
              >
                我知道了
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const styles = {
  overlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  modal: {
    position: 'relative' as const,
    backgroundColor: '#fff',
    borderRadius: '12px',
    padding: '30px',
    width: '90%',
    maxWidth: '400px',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.2)',
    textAlign: 'center' as const,
  },
  title: {
    margin: '0 0 10px 0',
    fontSize: '24px',
    color: '#333',
  },
  subtitle: {
    margin: '0 0 20px 0',
    color: '#666',
    fontSize: '14px',
  },
  qrContainer: {
    marginBottom: '20px',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrPlaceholder: {
    width: '200px',
    height: '200px',
    backgroundColor: '#f5f5f5',
    borderRadius: '8px',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px dashed #ccc',
    overflow: 'hidden',
  },
  qrText: {
    marginTop: '12px',
    color: '#666',
    fontSize: '14px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '15px',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'start',
  },
  input: {
    width: '100%',
    padding: '12px',
    borderRadius: '6px',
    border: '1px solid #ddd',
    fontSize: '16px',
    boxSizing: 'border-box' as const,
    outline: 'none',
  },
  button: {
    width: '100%',
    padding: '12px',
    borderRadius: '6px',
    border: 'none',
    backgroundColor: '#4CAF50',
    color: 'white',
    fontSize: '16px',
    cursor: 'pointer',
    fontWeight: 'bold',
    transition: 'background-color 0.2s',
  },
  error: {
    color: '#f44336',
    fontSize: '14px',
    textAlign: 'left' as const,
  },
  agreement: {
    marginTop: '10px',
    fontSize: '12px',
    color: '#888',
    lineHeight: '1.5',
  },
  link: {
    color: '#4a90e2',
    textDecoration: 'none',
    margin: '0 2px',
    cursor: 'pointer',
  },
  closeButtonWrapper: {
    position: 'absolute' as const,
    top: '15px',
    right: '15px',
  },
  closeModalButton: {
    background: 'none',
    border: 'none',
    fontSize: '20px',
    color: '#999',
    cursor: 'pointer',
    padding: '5px',
    lineHeight: 1,
  },
  policyOverlay: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
    borderRadius: '12px', // 匹配父级 modal 的圆角
  },
  policyModal: {
    backgroundColor: '#fff',
    borderRadius: '8px',
    width: '85%',
    maxHeight: '80%',
    display: 'flex',
    flexDirection: 'column' as const,
    boxShadow: '0 4px 15px rgba(0, 0, 0, 0.2)',
  },
  policyHeader: {
    padding: '15px 20px',
    borderBottom: '1px solid #eee',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  policyTitle: {
    margin: 0,
    fontSize: '18px',
    color: '#333',
  },
  closeButton: {
    background: 'none',
    border: 'none',
    fontSize: '20px',
    color: '#999',
    cursor: 'pointer',
    padding: '0 5px',
  },
  policyContent: {
    padding: '20px',
    overflowY: 'auto' as const,
    flex: 1,
    textAlign: 'left' as const,
  },
  policyText: {
    whiteSpace: 'pre-wrap' as const,
    fontFamily: 'inherit',
    fontSize: '14px',
    color: '#666',
    margin: 0,
    lineHeight: '1.6',
  },
  policyFooter: {
    padding: '15px 20px',
    borderTop: '1px solid #eee',
    display: 'flex',
    justifyContent: 'flex-end',
  },
  confirmButton: {
    padding: '8px 20px',
    borderRadius: '4px',
    border: 'none',
    backgroundColor: '#4a90e2',
    color: 'white',
    fontSize: '14px',
    cursor: 'pointer',
  },
};

export default ActivationModal;

