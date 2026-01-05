/**
 * edit_file - 编辑文件工具
 * 
 * 功能：对现有文件进行编辑修改
 * 类型：write（写操作，需要用户审批）
 * 
 * 使用 Google 的 diff-match-patch 库来智能应用编辑
 */

import { BaseTool } from '../base/BaseTool';
import type { ToolMetadata, ToolExecutionResult } from '../base/ITool';
import { overleafEditor } from '../../../editor/OverleafEditor';
import { diffMatchPatchService } from '../utils/DiffMatchPatchService';

/**
 * 编辑文件工具
 * 
 * 支持两种编辑模式：
 * 1. 带有 `// ... existing latex ...` 占位符的增量编辑
 * 2. 全量替换编辑
 */
export class EditFileTool extends BaseTool {
  protected metadata: ToolMetadata = {
    name: 'edit_file',
    description: `Use this tool to edit an existing LaTeX file.

**CRITICAL**: The \`latex_edit\` parameter must contain the MODIFIED/NEW content, NOT the original unchanged text. The system locates where to apply changes using anchor lines.

**How it works**:
1. Include 1-2 lines of UNCHANGED original text at the START as anchor (must exist verbatim in original)
2. Include your MODIFIED/NEW content 
3. Include 1-2 lines of UNCHANGED original text at the END as anchor (must exist verbatim in original)
4. Use \`// ... existing latex codes...\` to skip large unchanged sections

**Example**: To change "This is old text" to "This is NEW text":

Original file content:
\`\`\`
\\section{Title}
This is old text
\\section{Next}
\`\`\`

Your latex_edit should be:
\`\`\`
// ... existing latex codes...
\\section{Title}
This is NEW text
\\section{Next}
// ... existing latex codes...
\`\`\`

**Key Rules**:
- FIRST non-placeholder line = start anchor (MUST exist in original file)
- LAST non-placeholder line = end anchor (MUST exist in original file)
- Content between anchors gets REPLACED with your edit
- When modifying text, keep surrounding unchanged lines as anchors
- NEVER pass unchanged original text without modifications - that causes "no changes" error

You should specify the following arguments before the others: [target_file]`,
    parameters: {
      type: 'object',
      properties: {
        target_file: {
          type: 'string',
          description: 'The target file to modify. Always specify the target file as the first argument.'
        },
        instructions: {
          type: 'string',
          description: "A single sentence describing what change you are making. Use first person (e.g., 'I am changing X to Y')."
        },
        latex_edit: {
          type: 'string',
          description: 'The MODIFIED content with anchors. Structure: (1) `// ... existing latex codes...`, (2) 1-2 unchanged lines as START anchor, (3) your NEW/MODIFIED content, (4) 1-2 unchanged lines as END anchor, (5) `// ... existing latex codes...`. Anchors must match original file exactly. The middle content is what replaces the original.'
        }
      },
      required: ['target_file', 'instructions', 'latex_edit']
    },
    needApproval: false,
    modes: ['agent']
  };

  /**
   * 执行编辑文件
   */
  async execute(args: {
    target_file: string;
    instructions: string;
    latex_edit: string;
  }): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    
    try {
      console.log('[EditFileTool] execute called with:', {
        target_file: args.target_file,
        instructions: args.instructions,
        latex_edit_length: args.latex_edit?.length
      });

      if (!this.validate(args)) {
        return {
          success: false,
          error: 'Missing required parameters: target_file, instructions, latex_edit',
          duration: Date.now() - startTime
        };
      }

      // 1. 检查目标文件是否是当前打开的文件
      console.log('[EditFileTool] Step 1: Checking if target file is current file');
      const currentFileName = await this.getCurrentFileName();
      const targetBaseName = args.target_file.split('/').pop() || args.target_file;
      const isCurrentFile = currentFileName === targetBaseName || 
                           currentFileName === args.target_file ||
                           args.target_file.endsWith(currentFileName || '');
      
      console.log('[EditFileTool] Current file:', currentFileName, 'Target:', targetBaseName, 'Is current:', isCurrentFile);

      // 2. 获取当前文件内容
      let originalContent: string;
      
      if (isCurrentFile) {
        // 直接从编辑器获取当前打开文件的内容
        console.log('[EditFileTool] Step 2: Getting content from editor (current file)');
        originalContent = await overleafEditor.document.getText();
      } else {
        // 需要从服务器获取文件内容，但这样就无法直接编辑
        // 因为 setDocContent 只能修改当前打开的编辑器
        console.log('[EditFileTool] Step 2: Target file is not currently open');
        const docId = await this.getDocIdByPath(args.target_file);
        if (!docId) {
          console.error('[EditFileTool] Failed to find docId for', args.target_file);
          return {
            success: false,
            error: `无法找到文件 "${args.target_file}" 的文档 ID。请确保文件路径正确，且文件存在于项目中。`,
            duration: Date.now() - startTime
          };
        }
        
        // 提示用户需要先打开目标文件
        return {
          success: false,
          error: `目标文件 "${args.target_file}" 不是当前打开的文件。请先在 Overleaf 中打开该文件，然后再尝试编辑。当前打开的文件是: "${currentFileName}"`,
          duration: Date.now() - startTime
        };
      }
      console.log('[EditFileTool] Original content length:', originalContent.length);

      // 3. 清理编辑内容（移除代码块标记）
      console.log('[EditFileTool] Step 3: Cleaning edit content');
      const cleanedEdit = this.cleanEditContent(args.latex_edit);
      console.log('[EditFileTool] Cleaned edit:', cleanedEdit.substring(0, 200) + '...');

      // 4. 使用 DiffMatchPatchService 应用编辑
      console.log('[EditFileTool] Step 4: Applying edit with DiffMatchPatchService');
      const applyResult = diffMatchPatchService.applyEdit(originalContent, cleanedEdit);
      console.log('[EditFileTool] Apply result:', {
        success: applyResult.success,
        changesApplied: applyResult.changesApplied,
        error: applyResult.error,
        newContentLength: applyResult.newContent?.length,
        debugInfo: applyResult.debugInfo
      });

      if (!applyResult.success) {
        return {
          success: false,
          error: applyResult.error || '编辑应用失败',
          duration: Date.now() - startTime,
          data: {
            file: args.target_file,
            debugInfo: applyResult.debugInfo
          }
        };
      }

      // 5. 检查内容是否真的有变化
      if (applyResult.newContent === originalContent) {
        console.log('[EditFileTool] No changes detected');
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
      console.log('[EditFileTool] Step 5: Setting document content');
      const setResult = await overleafEditor.editor.setDocContent(applyResult.newContent);
      console.log('[EditFileTool] Set result:', setResult);

      if (!setResult.success) {
        return {
          success: false,
          error: '无法将编辑应用到编辑器',
          duration: Date.now() - startTime
        };
      }

      console.log('[EditFileTool] Edit successful:', setResult.oldLength, '->', setResult.newLength);

      return {
        success: true,
        data: {
          file: args.target_file,
          instructions: args.instructions,
          applied: true,
          message: `成功编辑文件 ${args.target_file}`,
          changesApplied: applyResult.changesApplied,
          oldLength: setResult.oldLength,
          newLength: setResult.newLength,
          diff: {
            added: setResult.newLength - setResult.oldLength,
            linesChanged: this.countLineChanges(originalContent, applyResult.newContent)
          }
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
   * 清理编辑内容
   * 移除可能的代码块标记（```latex 或 ```）
   * 修复反斜杠转义问题（AI 可能会在 JSON 中过度转义）
   */
  private cleanEditContent(editContent: string): string {
    let content = editContent.trim();
    
    // 移除开头的代码块标记
    const codeBlockStart = /^```(\w+)?\s*\n?/;
    content = content.replace(codeBlockStart, '');
    
    // 移除结尾的代码块标记
    const codeBlockEnd = /\n?```\s*$/;
    content = content.replace(codeBlockEnd, '');
    
    // 修复反斜杠转义问题
    // AI 在 JSON 中可能会将 \command 写成 \\command
    // 需要将 \\ 后面跟着字母的情况转换为单个 \
    // 注意：保留 LaTeX 换行符 \\ (后面通常跟空格、换行或行尾)
    content = this.normalizeLatexBackslashes(content);
    
    return content;
  }

  /**
   * 规范化 LaTeX 反斜杠
   * 将过度转义的双反斜杠 (\\command) 转换为单反斜杠 (\command)
   * 但保留 LaTeX 换行符 (\\)
   */
  private normalizeLatexBackslashes(content: string): string {
    // 匹配 \\ 后面紧跟字母的情况（这是错误的转义）
    // 例如：\\subsection -> \subsection
    // 但不匹配：\\ (换行) 或 \\[ (显示数学环境)
    
    // 策略：将 \\ 后面紧跟 a-zA-Z 的情况替换为单个 \
    // 这样 \\subsection 变成 \subsection
    // 而 \\ 或 \\[ 保持不变
    return content.replace(/\\\\([a-zA-Z])/g, '\\$1');
  }

  /**
   * 计算行变化数量
   */
  private countLineChanges(oldContent: string, newContent: string): number {
    const oldLines = oldContent.split('\n').length;
    const newLines = newContent.split('\n').length;
    return Math.abs(newLines - oldLines);
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
}
