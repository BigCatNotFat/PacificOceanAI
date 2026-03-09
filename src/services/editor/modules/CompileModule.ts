/**
 * 编译模块
 * 负责 LaTeX 编译相关操作（通过注入脚本的 compile handler）
 */

import { BaseModule } from './BaseModule';

export interface CompilerInfo {
  index: number;
  name: string;
  current: boolean;
}

export interface CompileError {
  message: string;
  line: number | null;
}

export interface CompileWarning {
  message: string;
}

export interface CompileOutputFile {
  path: string;
  url: string;
  type: string;
  build: string;
}

export interface CompileResult {
  status: string;
  compileGroup: string | null;
  outputFiles: CompileOutputFile[];
  errors: CompileError[];
  warnings: CompileWarning[];
  logSummary: string | null;
}

export interface SwitchCompilerResult {
  success: boolean;
  compiler: string;
  changed: boolean;
  previous?: string;
}

export interface CompileOptions {
  draft?: boolean;
  rootDocId?: string;
}

export class CompileModule extends BaseModule {
  /**
   * 获取当前编译器名称
   */
  async getCompiler(): Promise<string | null> {
    return this.call<string | null>('getCompiler');
  }

  /**
   * 列出所有可用编译器及当前选中项
   */
  async listCompilers(): Promise<CompilerInfo[]> {
    return this.call<CompilerInfo[]>('listCompilers');
  }

  /**
   * 切换编译器
   * @param compiler 目标编译器名称（pdflatex / xelatex / lualatex / latex）
   */
  async switchCompiler(compiler: string): Promise<SwitchCompilerResult> {
    return this.call<SwitchCompilerResult>('switchCompiler', compiler);
  }

  /**
   * 触发编译并返回结果（含错误、警告、日志摘要）
   */
  async compile(options?: CompileOptions): Promise<CompileResult> {
    return this.call<CompileResult>('compile', options || {});
  }

  /**
   * 停止正在进行的编译
   */
  async stopCompile(): Promise<{ success: boolean }> {
    return this.call<{ success: boolean }>('stopCompile');
  }

  /**
   * 清除编译缓存
   */
  async clearCache(): Promise<{ success: boolean }> {
    return this.call<{ success: boolean }>('clearCache');
  }
}
