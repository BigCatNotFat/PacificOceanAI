/**
 * CodexOAuthService - OpenAI Codex OAuth 认证服务
 *
 * 通过 OAuth PKCE 流程使用 ChatGPT 订阅（Plus/Pro/Business）访问 OpenAI Codex 模型，
 * 无需单独的 API Key 计费。
 *
 * 认证参数来自 OpenAI 官方 Codex CLI 开源实现 (github.com/openai/codex)。
 */

const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const AUTHORIZE_URL = 'https://auth.openai.com/oauth/authorize';
const TOKEN_URL = 'https://auth.openai.com/oauth/token';
const REDIRECT_URI = 'http://localhost:1455/auth/callback';
const SCOPE = 'openid profile email offline_access';

const STORAGE_KEY = 'codex_oauth_tokens';

export interface CodexOAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  chatgptAccountId: string;
}

interface PKCEPair {
  verifier: string;
  challenge: string;
}

class CodexOAuthServiceImpl {
  private pendingLogin: {
    state: string;
    verifier: string;
    tabId: number;
    resolve: (tokens: CodexOAuthTokens | null) => void;
    reject: (error: Error) => void;
  } | null = null;

  /**
   * 发起 OAuth 登录流程
   * 打开 OpenAI 登录页面，用户授权后自动获取令牌
   */
  async login(): Promise<CodexOAuthTokens> {
    const pkce = await this.generatePKCE();
    const state = this.generateRandomHex(32);

    const authUrl = new URL(AUTHORIZE_URL);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.set('scope', SCOPE);
    authUrl.searchParams.set('code_challenge', pkce.challenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('id_token_add_organizations', 'true');
    authUrl.searchParams.set('codex_cli_simplified_flow', 'true');
    authUrl.searchParams.set('originator', 'codex_cli_rs');

    return new Promise<CodexOAuthTokens>((resolve, reject) => {
      chrome.tabs.create({ url: authUrl.toString() }, (tab) => {
        if (!tab?.id) {
          reject(new Error('无法打开登录页面'));
          return;
        }

        this.pendingLogin = {
          state,
          verifier: pkce.verifier,
          tabId: tab.id,
          resolve,
          reject
        };

        chrome.tabs.onUpdated.addListener(this.handleTabUpdate);
      });
    });
  }

  /**
   * 退出登录，清除存储的令牌
   */
  async logout(): Promise<void> {
    await chrome.storage.local.remove(STORAGE_KEY);
  }

  /**
   * 获取有效的 OAuth 令牌（自动刷新过期令牌）
   */
  async getValidTokens(): Promise<CodexOAuthTokens | null> {
    const tokens = await this.getStoredTokens();
    if (!tokens) return null;

    const bufferMs = 60 * 1000;
    if (Date.now() >= tokens.expiresAt - bufferMs) {
      try {
        return await this.refreshTokens(tokens.refreshToken);
      } catch {
        return null;
      }
    }

    return tokens;
  }

  /**
   * 检查当前是否已登录
   */
  async isLoggedIn(): Promise<boolean> {
    const tokens = await this.getStoredTokens();
    return tokens !== null;
  }

  /**
   * 获取存储的令牌（不做刷新）
   */
  async getStoredTokens(): Promise<CodexOAuthTokens | null> {
    return new Promise((resolve) => {
      chrome.storage.local.get(STORAGE_KEY, (result) => {
        resolve(result[STORAGE_KEY] || null);
      });
    });
  }

  // ==================== 私有方法 ====================

  private handleTabUpdate = (
    tabId: number,
    changeInfo: chrome.tabs.TabChangeInfo,
    _tab: chrome.tabs.Tab
  ) => {
    if (!this.pendingLogin || tabId !== this.pendingLogin.tabId) return;
    if (!changeInfo.url) return;

    const url = changeInfo.url;
    if (!url.startsWith(REDIRECT_URI)) return;

    chrome.tabs.onUpdated.removeListener(this.handleTabUpdate);
    chrome.tabs.remove(tabId).catch(() => {});

    const pending = this.pendingLogin;
    this.pendingLogin = null;

    try {
      const parsed = new URL(url);
      const code = parsed.searchParams.get('code');
      const returnedState = parsed.searchParams.get('state');

      if (!code) {
        const error = parsed.searchParams.get('error') || '未收到授权码';
        pending.reject(new Error(`登录失败: ${error}`));
        return;
      }

      if (returnedState !== pending.state) {
        pending.reject(new Error('登录失败: state 不匹配，可能存在安全风险'));
        return;
      }

      this.exchangeCodeForTokens(code, pending.verifier)
        .then(pending.resolve)
        .catch(pending.reject);
    } catch (err) {
      pending.reject(err instanceof Error ? err : new Error(String(err)));
    }
  };

  private async exchangeCodeForTokens(
    code: string,
    verifier: string
  ): Promise<CodexOAuthTokens> {
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: CLIENT_ID,
        code,
        code_verifier: verifier,
        redirect_uri: REDIRECT_URI,
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`令牌交换失败: ${response.status} ${text}`);
    }

    const json = await response.json() as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };

    if (!json.access_token || !json.refresh_token || typeof json.expires_in !== 'number') {
      throw new Error('令牌响应缺少必要字段');
    }

    const accountId = this.extractAccountId(json.access_token);
    if (!accountId) {
      throw new Error('无法从令牌中提取 ChatGPT 账户 ID');
    }

    const tokens: CodexOAuthTokens = {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: Date.now() + json.expires_in * 1000,
      chatgptAccountId: accountId,
    };

    await this.storeTokens(tokens);
    return tokens;
  }

  private async refreshTokens(refreshToken: string): Promise<CodexOAuthTokens> {
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: CLIENT_ID,
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      await this.logout();
      throw new Error('令牌刷新失败，请重新登录');
    }

    const json = await response.json() as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };

    if (!json.access_token || !json.refresh_token || typeof json.expires_in !== 'number') {
      await this.logout();
      throw new Error('刷新响应缺少必要字段');
    }

    const accountId = this.extractAccountId(json.access_token);
    if (!accountId) {
      throw new Error('刷新后无法提取 ChatGPT 账户 ID');
    }

    const tokens: CodexOAuthTokens = {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: Date.now() + json.expires_in * 1000,
      chatgptAccountId: accountId,
    };

    await this.storeTokens(tokens);
    return tokens;
  }

  private extractAccountId(accessToken: string): string | null {
    try {
      const parts = accessToken.split('.');
      if (parts.length !== 3) return null;
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      return payload?.['https://api.openai.com/auth']?.chatgpt_account_id || null;
    } catch {
      return null;
    }
  }

  private async storeTokens(tokens: CodexOAuthTokens): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY]: tokens }, resolve);
    });
  }

  // ==================== PKCE 工具方法 ====================

  private async generatePKCE(): Promise<PKCEPair> {
    const verifier = this.generateRandomHex(64);
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    const challenge = this.base64UrlEncode(digest);
    return { verifier, challenge };
  }

  private generateRandomHex(length: number): string {
    const bytes = new Uint8Array(length / 2);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  }

  private base64UrlEncode(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
}

export const codexOAuthService = new CodexOAuthServiceImpl();
