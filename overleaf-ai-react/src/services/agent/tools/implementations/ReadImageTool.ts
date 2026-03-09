/**
 * read_image - 读取并分析图片工具
 *
 * 功能：读取 Overleaf 项目中的图片文件，转为 base64 后发送给视觉模型分析
 * 类型：read（只读操作，不需要用户审批）
 *
 * 多策略获取图片：
 * 1. 通过 REST API 文件树获取 file entity ID，直接构造 /project/{pid}/file/{fid} 下载
 * 2. 回退到 DOM 点击方式打开图片预览
 */

import { BaseTool } from '../base/BaseTool';
import type { ToolMetadata, ToolExecutionResult } from '../base/ITool';
import { overleafEditor } from '../../../editor/OverleafEditor';

const MAX_IMAGE_SIZE_BYTES = 4 * 1024 * 1024; // 4MB

const SUPPORTED_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'];

const EXT_TO_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
};

export class ReadImageTool extends BaseTool {
  protected metadata: ToolMetadata = {
    name: 'read_image',
    description: `Read and analyze an image file from the Overleaf project. This tool fetches the image and returns it for visual analysis.
Supported formats: PNG, JPG, JPEG, GIF, WebP, BMP, SVG.
Maximum file size: 4MB.
Use this tool when you need to understand the content of a figure, chart, diagram, or any image in the project.
The image will be sent to the vision model for analysis - you can describe what you see and answer questions about it.`,
    parameters: {
      type: 'object',
      properties: {
        explanation: {
          type: 'string',
          description: 'One sentence explanation as to why this tool is being used, and how it contributes to the goal.'
        },
        target_file: {
          type: 'string',
          description: 'The path/name of the image file to read (e.g., "figures/diagram.png", "logo.jpg").'
        }
      },
      required: ['target_file']
    },
    needApproval: false,
    modes: ['agent', 'chat']
  };

  async execute(args: {
    target_file: string;
    explanation?: string;
  }): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      if (!this.validate(args)) {
        return {
          success: false,
          error: 'Missing required parameter: target_file',
          duration: Date.now() - startTime
        };
      }

      const fileName = args.target_file;
      const ext = fileName.split('.').pop()?.toLowerCase() || '';

      if (!SUPPORTED_EXTENSIONS.includes(ext)) {
        return {
          success: false,
          error: `不支持的图片格式: .${ext}。支持的格式: ${SUPPORTED_EXTENSIONS.join(', ')}`,
          duration: Date.now() - startTime
        };
      }

      this.log(`读取图片: ${fileName}`);

      // 策略 1：通过 REST API 获取文件 ID，直接下载图片（最可靠，不依赖 DOM 状态）
      let dataUrl = await this.fetchViaFileTreeAPI(fileName);

      // 策略 2：回退到 DOM 点击方式
      if (!dataUrl) {
        console.log('[ReadImageTool] 策略1(API)失败，尝试策略2(DOM)');
        const previewUrl = await this.getImagePreviewUrlViaDom(fileName);
        if (previewUrl) {
          dataUrl = await this.fetchAsDataUrl(previewUrl);
        }
      }

      if (!dataUrl) {
        return {
          success: false,
          error: `无法获取图片 "${fileName}"。请确认文件名正确（区分大小写）且文件存在于项目中。`,
          duration: Date.now() - startTime
        };
      }

      return {
        success: true,
        data: {
          type: 'image',
          file: fileName,
          image_url: dataUrl,
          message: `成功读取图片 ${fileName}`
        },
        duration: Date.now() - startTime
      };
    } catch (error) {
      return {
        ...this.handleError(error),
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * 策略 1：通过文件树 API 获取 file entity ID，直接构造下载 URL
   * Overleaf 二进制文件（图片）的下载地址是 /project/{projectId}/file/{fileId}
   */
  private async fetchViaFileTreeAPI(fileName: string): Promise<string | null> {
    try {
      const normalizedPath = fileName.startsWith('/') ? fileName : `/${fileName}`;
      const baseName = fileName.split('/').pop() || fileName;

      // 获取 projectId
      const projectId = await overleafEditor.project.getProjectId();
      if (!projectId) {
        console.warn('[ReadImageTool] 无法获取 projectId');
        return null;
      }

      // 从文件树中查找文件 entity
      const fileTree = await overleafEditor.project.getFileTree();
      let fileId: string | null = null;

      for (const entity of fileTree.entities) {
        const entityAny = entity as any;
        // 图片是 fileRef 类型，不是 doc 类型
        const id = entityAny._id ?? entity.id ?? entityAny.file_id ?? entityAny.fileId;
        if (!id) continue;

        const entityPath = entity.path;
        const entityBaseName = entityPath.split('/').pop() || '';

        if (entityPath === normalizedPath || entityBaseName === baseName) {
          fileId = id;
          console.log(`[ReadImageTool] 从文件树找到图片: ${entityPath} -> ${fileId}`);
          break;
        }
      }

      if (!fileId) {
        // 尝试从 DOM 中查找 file ID（图片文件可能有 data-file-id 属性）
        fileId = this.findFileIdInDom(baseName);
      }

      if (!fileId) {
        console.warn(`[ReadImageTool] 未在文件树中找到: ${fileName}`);
        return null;
      }

      // 构造下载 URL 并 fetch
      const downloadUrl = `/project/${projectId}/file/${fileId}`;
      console.log(`[ReadImageTool] 直接下载图片: ${downloadUrl}`);
      return await this.fetchAsDataUrl(downloadUrl, fileName);
    } catch (error) {
      console.warn('[ReadImageTool] 文件树 API 方式失败:', error);
      return null;
    }
  }

  /**
   * 从 DOM 的文件树中查找文件 ID
   */
  private findFileIdInDom(baseName: string): string | null {
    // 查找所有 treeitem，包括可能隐藏在折叠文件夹中但仍存在于 DOM 的节点
    const treeItems = document.querySelectorAll('li[role="treeitem"]');
    for (const item of Array.from(treeItems)) {
      const label = item.getAttribute('aria-label') || '';
      if (label === baseName || label.includes(baseName)) {
        // 尝试获取 data-file-id
        const entity = item.querySelector('.entity') as HTMLElement | null;
        const id = entity?.getAttribute('data-file-id');
        if (id) {
          console.log(`[ReadImageTool] 从 DOM 找到 file ID: ${baseName} -> ${id}`);
          return id;
        }
      }
    }
    return null;
  }

  /**
   * 策略 2（回退）：通过 DOM 点击打开图片文件，从渲染的 img 中获取预览 URL
   */
  private async getImagePreviewUrlViaDom(fileName: string): Promise<string | null> {
    try {
      const baseName = fileName.split('/').pop() || fileName;

      // 尝试先展开所有折叠的文件夹
      this.expandAllFolders();
      await this.sleep(500);

      // 在文件树中查找并点击图片文件
      const opened = this.openFileInEditor(baseName);
      if (!opened) {
        // 再尝试用 Bridge 的 switchFile
        try {
          const result = await overleafEditor.file.switchFile(baseName);
          if (!result.success) {
            console.error(`[ReadImageTool] 所有方式均无法打开文件 ${baseName}`);
            return null;
          }
        } catch {
          console.error(`[ReadImageTool] switchFile 失败: ${baseName}`);
          return null;
        }
      }

      await this.sleep(2000);

      // 从 DOM 中查找渲染出的 img 元素
      let targetImg: HTMLImageElement | null = null;
      const imgs = document.querySelectorAll('img');
      imgs.forEach((img) => {
        if (targetImg) return;
        const alt = img.getAttribute('alt') || '';
        const src = img.getAttribute('src') || '';
        if (alt.includes(baseName) || src.includes(baseName.split('.')[0])) {
          targetImg = img as HTMLImageElement;
        }
      });

      if (!targetImg) {
        const editorArea = document.querySelector('.cm-editor, .editor-container, .binary-file');
        if (editorArea) {
          const editorImg = editorArea.querySelector('img');
          if (editorImg) {
            targetImg = editorImg as HTMLImageElement;
          }
        }
      }

      if (!targetImg) {
        console.error('[ReadImageTool] 未在页面中找到图片预览');
        return null;
      }

      return targetImg.getAttribute('src') || targetImg.src || null;
    } catch (error) {
      console.error('[ReadImageTool] DOM 方式获取图片失败:', error);
      return null;
    }
  }

  /**
   * 展开文件树中所有折叠的文件夹
   */
  private expandAllFolders(): void {
    try {
      const collapsedFolders = document.querySelectorAll(
        'li[role="treeitem"][aria-expanded="false"]'
      );
      collapsedFolders.forEach((folder) => {
        const toggle = folder.querySelector('.expand-collapse-btn, button[aria-label], .item-name-button');
        if (toggle) {
          (toggle as HTMLElement).click();
        }
      });
      if (collapsedFolders.length > 0) {
        console.log(`[ReadImageTool] 展开了 ${collapsedFolders.length} 个折叠文件夹`);
      }
    } catch (error) {
      console.warn('[ReadImageTool] 展开文件夹失败:', error);
    }
  }

  private openFileInEditor(fileName: string): boolean {
    try {
      const fileItems = document.querySelectorAll('li[role="treeitem"]');
      for (const item of Array.from(fileItems)) {
        const itemLabel = item.getAttribute('aria-label');
        if (itemLabel && (itemLabel === fileName || itemLabel.includes(fileName))) {
          const fileLink = item.querySelector('.entity, .outline-item-link, .item-name-button, button');
          if (fileLink) {
            const eventOptions = { bubbles: true, cancelable: true, view: window };
            fileLink.dispatchEvent(new MouseEvent('mousedown', eventOptions));
            fileLink.dispatchEvent(new MouseEvent('mouseup', eventOptions));
            fileLink.dispatchEvent(new MouseEvent('click', eventOptions));
            return true;
          }
        }
      }
      return false;
    } catch (error) {
      console.error('[ReadImageTool] 打开文件失败:', error);
      return false;
    }
  }

  /**
   * fetch 图片并转换为 base64 data URL
   * @param url 图片 URL
   * @param fileNameHint 可选的文件名，用于在服务器返回错误 MIME 时根据扩展名修正
   */
  private async fetchAsDataUrl(url: string, fileNameHint?: string): Promise<string | null> {
    try {
      if (url.startsWith('data:')) {
        return url;
      }

      const response = await fetch(url);
      if (!response.ok) {
        console.error(`[ReadImageTool] fetch 图片失败: ${response.status}`);
        return null;
      }

      const blob = await response.blob();

      if (blob.size > MAX_IMAGE_SIZE_BYTES) {
        console.error(`[ReadImageTool] 图片过大: ${(blob.size / 1024 / 1024).toFixed(1)}MB > 4MB`);
        return null;
      }

      // Overleaf 可能返回 application/octet-stream，需要根据扩展名修正 MIME
      let correctBlob = blob;
      if (!blob.type.startsWith('image/')) {
        const hint = fileNameHint || url;
        const ext = hint.split('.').pop()?.toLowerCase() || '';
        const correctMime = EXT_TO_MIME[ext];
        if (correctMime) {
          console.log(`[ReadImageTool] 修正 MIME: ${blob.type} -> ${correctMime}`);
          correctBlob = new Blob([blob], { type: correctMime });
        }
      }

      return new Promise<string | null>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(correctBlob);
      });
    } catch (error) {
      console.error('[ReadImageTool] 转换图片失败:', error);
      return null;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getSummary(args: { target_file: string }): string {
    return `读取图片 ${args.target_file}`;
  }
}
