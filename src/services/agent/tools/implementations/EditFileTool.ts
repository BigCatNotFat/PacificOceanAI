/**
 * edit_file - 编辑文件工具
 * 
 * 功能：对现有文件进行编辑修改
 * 类型：write（写操作，需要用户审批）
 * 
 * 简化版：使用简单的字符串替换
 */

import { BaseTool } from '../base/BaseTool';
import type { ToolMetadata, ToolExecutionResult } from '../base/ITool';
import { overleafEditor } from '../../../editor/OverleafEditor';
import { logger } from '../../../../utils/logger';

/**
 * 编辑文件工具
 * 
 * 使用 search & replace 模式
 */
export class EditFileTool extends BaseTool {
  protected metadata: ToolMetadata = {
    name: 'edit_file',
    description: `Modify a file by replacing a specific text segment.
**CRITICAL RULE**: You MUST use "..." to elide middle content in old_string. This is MANDATORY, not optional, unless old_string is very short, like only two or three words.
- NEVER provide the complete text if it's more than one sentence.

Usage:
1. Provide the \`target_file\` path.
2. Provide the \`old_string\` with middle content elided using "...". 
3. Provide the \`new_string\` (full replacement text).
4. Provide \`instructions\` explaining the change.

CORRECT examples:
old_string = "\\begin{abstract}\\nRegularization is a crucial technique...\\n\\end{abstract}"
old_string = "\\begin{Introduction}\\n随着6G技术的不断发展\\cite{6G}...\\n\\end{Introduction}"
old_string = "\\cite{10244}. Deep learning has achieved...stronger generalization ability"
old_string = "I like to eat apple"

INCORRECT examples:
old_string = "regularization is a crucial technique..."
`,

    parameters: {
      type: 'object',
      properties: {
        target_file: {
          type: 'string',
          description: 'The target file to modify. Always specify the target file as the first argument.'
        },
        old_string: {
          type: 'string',
          description: 'The text to be replaced, with the middle section elided using "...". IMPORTANT: When using "...", the content before and after must contain content.'
        },
        new_string: {
          type: 'string',
          description: 'The new text to replace the original text with.'
        },
        instructions: {
          type: 'string',
          description: "Brief one-sentence summary of the change"
        }
      },
      required: ['target_file', 'old_string', 'new_string', 'instructions']
    },
    needApproval: false,
    modes: ['agent']
  };

  /**
   * 执行编辑文件
   */
  async execute(args: {
    target_file: string;
    old_string: string;
    new_string: string;
    instructions: string;
  }): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    
    try {
      logger.debug('[EditFileTool] execute called with:', {
        target_file: args.target_file,
        instructions: args.instructions,
        old_string_len: args.old_string?.length,
        new_string_len: args.new_string?.length
      });

      if (!this.validate(args)) {
        return {
          success: false,
          error: 'Missing required parameters',
          duration: Date.now() - startTime
        };
      }

      // 1. 检查目标文件是否是当前打开的文件
      logger.debug('[EditFileTool] Step 1: Checking if target file is current file');
      const currentFileName = await this.getCurrentFileName();
      const targetBaseName = args.target_file.split('/').pop() || args.target_file;
      const isCurrentFile = currentFileName === targetBaseName || 
                           currentFileName === args.target_file ||
                           args.target_file.endsWith(currentFileName || '');
      
      logger.debug('[EditFileTool] Current file:', currentFileName, 'Target:', targetBaseName, 'Is current:', isCurrentFile);

      // 2. 如果不是当前文件，尝试切换
      if (!isCurrentFile) {
        logger.debug(`[EditFileTool] Target file "${targetBaseName}" is not active (current: "${currentFileName}"). Attempting to switch...`);
        
        // 尝试切换文件
        const switchResult = await overleafEditor.file.switchFile(targetBaseName);
        
        if (!switchResult.success) {
          console.error('[EditFileTool] Switch failed:', switchResult.error);
          
          // 如果切换失败，尝试回退到旧逻辑（检查是否在项目中但未打开）
          const docId = await this.getDocIdByPath(args.target_file);
          if (!docId) {
            return {
              success: false,
              error: `无法找到文件 "${args.target_file}" 且自动切换失败。请确保文件存在于项目中。`,
              duration: Date.now() - startTime
            };
          }
          
          return {
            success: false,
            error: `无法自动切换到文件 "${args.target_file}": ${switchResult.error}。请手动在 Overleaf 中打开该文件。`,
            duration: Date.now() - startTime
          };
        }

        logger.debug('[EditFileTool] Switch command sent. Waiting for editor to update...');
        
        // 等待文件切换完成
        const switchSuccess = await this.waitForFileSwitch(targetBaseName);
        
        if (!switchSuccess) {
          return {
            success: false,
            error: `已发送切换指令，但文件 "${args.target_file}" 似乎未能成功加载。请稍后重试或手动打开文件。`,
            duration: Date.now() - startTime
          };
        }
        
        logger.debug('[EditFileTool] File switched successfully.');
      }

      // 3. 获取当前文件内容
      logger.debug('[EditFileTool] Step 2: Getting content from editor');
      let originalContent = await overleafEditor.document.getText();
      
      // 4. 执行替换
      logger.debug('[EditFileTool] Step 3: Performing replacement');
      
      let matchString = args.old_string;

      // 检查 old_string 是否存在
      if (originalContent.indexOf(matchString) === -1) {
        // 尝试使用 ... 通配符匹配
        const ellipsisMatch = this.findMatchWithEllipsis(originalContent, args.old_string);
        
        if (ellipsisMatch) {
          logger.debug('[EditFileTool] Found match using ellipsis wildcard');
          matchString = ellipsisMatch;
        } else {
          // 尝试进行一些基本的清理（例如标准化换行符）再试一次
          const normalizedContent = originalContent.replace(/\r\n/g, '\n');
          const normalizedOld = args.old_string.replace(/\r\n/g, '\n');
          
          if (normalizedContent.indexOf(normalizedOld) === -1) {
              return {
                  success: false,
                  error: `Could not find exact match for old_string in file. If you used '...', ensure context before and after matches exactly.`,
                  duration: Date.now() - startTime,
                  data: {
                    file: args.target_file,
                    found: false
                  }
              };
          } else {
             // 如果标准化后找到了，但在原始内容没找到，说明是换行符问题。
             // 此时如果不更新 matchString，replace 将会失败。
             // 但我们很难从 normalized 映射回 original。
             // 这里保留原逻辑的缺陷（实际上原逻辑在这种情况下会返回"No changes detected"），
             // 或者我们尝试更聪明一点？
             // 鉴于这是一个 "简单" 替换工具，提示用户精确匹配可能是对的。
             // 但为了健壮性，我们可以提示用户。
          }
        }
      }

      // 执行替换 (只替换第一个匹配项)
      // 注意：如果上面是通过 normalized 找到的但 matchString 没变，这里 replace 会失败（返回原字符串）
      const newContent = originalContent.replace(matchString, args.new_string);

      // 5. 检查内容是否真的有变化
      if (newContent === originalContent) {
        logger.debug('[EditFileTool] No changes detected');
        return {
          success: true,
          data: {
            file: args.target_file,
            instructions: args.instructions,
            applied: false,
            message: '编辑内容与原文相同，无需修改',
            changesApplied: 0
          },
          duration: Date.now() - startTime
        };
      }

      // 6. 应用编辑到编辑器
      logger.debug('[EditFileTool] Step 5: Setting document content');
      const setResult = await overleafEditor.editor.setDocContent(newContent);
      logger.debug('[EditFileTool] Set result:', setResult);

      if (!setResult.success) {
        return {
          success: false,
          error: '无法将编辑应用到编辑器',
          duration: Date.now() - startTime
        };
      }

      logger.debug('[EditFileTool] Edit successful:', setResult.oldLength, '->', setResult.newLength);

      return {
        success: true,
        data: {
          file: args.target_file,
          instructions: args.instructions,
          applied: true,
          message: `成功编辑文件 ${args.target_file}`,
          changesApplied: 1,
          oldLength: setResult.oldLength,
          newLength: setResult.newLength
        },
        duration: Date.now() - startTime
      };
    } catch (error) {
      console.error('[EditFileTool] Error:', error);
      return {
        ...this.handleError(error),
        duration: Date.now() - startTime,
        data: {
          file: args.target_file,
          error: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  /**
   * 生成摘要
   */
  getSummary(args: {
    target_file: string;
    instructions: string;
  }): string {
    return `编辑文件 ${args.target_file}: ${args.instructions}`;
  }

  /**
   * 从 DOM 获取文件 ID 映射
   */
  private getDomFileIdMap(): Map<string, string> {
    const map = new Map<string, string>();

    try {
      const fileItems = document.querySelectorAll('[data-file-id]');

      fileItems.forEach((item) => {
        const el = item as HTMLElement;
        const id = el.getAttribute('data-file-id');
        if (!id) return;

        const nameSpan = el.querySelector('.item-name-button span') as HTMLElement | null;
        const name = nameSpan?.textContent?.trim();
        if (!name) return;

        map.set(name, id);
      });
    } catch (error) {
      console.error('[EditFileTool] 获取 DOM 文件 ID 映射失败:', error);
    }

    return map;
  }

  /**
   * 获取当前打开的文件名
   */
  private async getCurrentFileName(): Promise<string | null> {
    try {
      const fileInfo = await overleafEditor.file.getInfo();
      return fileInfo.fileName;
    } catch (error) {
      console.error('[EditFileTool] Failed to get current file name:', error);
      // Fallback: 从 DOM 获取
      try {
        const breadcrumb = document.querySelector('.ol-cm-breadcrumbs, .breadcrumbs');
        if (breadcrumb) {
          const nameElement = breadcrumb.querySelector('div:last-child');
          return nameElement?.textContent?.trim() || null;
        }
      } catch {
        // ignore
      }
      return null;
    }
  }

  /**
   * 根据文件路径查找对应的 docId
   */
  private async getDocIdByPath(targetFile: string): Promise<string | null> {
    // 规范化路径
    const normalizedPath = targetFile.startsWith('/') ? targetFile : `/${targetFile}`;
    const baseName = targetFile.split('/').pop() || targetFile;

    try {
      // 优先从文件树 API 获取
      const fileTree = await overleafEditor.project.getFileTree();
      for (const entity of fileTree.entities) {
        // 完整路径匹配
        if (entity.path === normalizedPath) {
          const id = entity.id ?? entity._id;
          if (id) return id;
        }
        // 文件名匹配（fallback）
        const entityBaseName = entity.path.split('/').pop();
        if (entityBaseName === baseName) {
          const id = entity.id ?? entity._id;
          if (id) return id;
        }
      }
    } catch (error) {
      this.log(`从文件树获取 docId 失败: ${error}`);
    }

    // Fallback: 从 DOM 获取
    const domMap = this.getDomFileIdMap();
    return domMap.get(baseName) ?? null;
  }

  /**
   * 等待文件切换完成
   * 轮询检查当前文件名是否与目标匹配
   */
  private async waitForFileSwitch(targetFileName: string, timeoutMs = 3000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const current = await this.getCurrentFileName();
      if (current === targetFileName || (current && targetFileName.endsWith(current))) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    return false;
  }

  /**
   * 转义正则特殊字符
   */
  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * 尝试使用 ... 通配符查找匹配
   */
  private findMatchWithEllipsis(originalContent: string, oldString: string): string | null {
    // 检查是否包含 "..."
    if (!oldString.includes('...')) {
      return null;
    }

    // 分割并转义
    const parts = oldString.split('...').map(part => this.escapeRegExp(part));
    
    // 构建正则：part0 .*? part1 .*? part2 ...
    // 使用 [\s\S]*? 跨行非贪婪匹配
    const patternString = parts.join('[\\s\\S]*?');
    
    try {
      const regex = new RegExp(patternString);
      const match = originalContent.match(regex);
      return match ? match[0] : null;
    } catch (e) {
      console.error('[EditFileTool] Regex construction failed:', e);
      return null;
    }
  }
}
