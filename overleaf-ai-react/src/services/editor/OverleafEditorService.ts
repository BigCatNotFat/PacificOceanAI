import { Disposable } from '../../base/common/disposable';
import { Emitter } from '../../base/common/event';
import type { Event } from '../../base/common/event';
import type { FileTreeItem, IEditorService, OutlineItem } from '../../platform/editor/editor';

export class OverleafEditorService extends Disposable implements IEditorService {
  private readonly _onDidChangeActiveFile = new Emitter<string | null>();

  readonly onDidChangeActiveFile: Event<string | null> = this._onDidChangeActiveFile.event;

  getCurrentFileName(): string | null {
    try {
      const breadcrumb = document.querySelector('.ol-cm-breadcrumbs, .breadcrumbs');
      if (breadcrumb) {
        const fileNameElement = breadcrumb.querySelector('div:last-child');
        const text = fileNameElement?.textContent?.trim();
        if (text) return text;
      }

      const selectedItem = document.querySelector(
        'li[role="treeitem"].selected, li[role="treeitem"][aria-selected="true"]'
      );
      if (selectedItem) {
        return selectedItem.getAttribute('aria-label');
      }

      return null;
    } catch (error) {
      console.error('获取当前文件名时出错:', error);
      return null;
    }
  }

  readLine(lineNumber: number): string | null {
    try {
      const lines = document.querySelectorAll('.cm-line');

      if (lines.length === 0) {
        console.error('未找到任何 .cm-line 元素');
        return null;
      }

      if (lineNumber < 1 || lineNumber > lines.length) {
        console.error(`行号 ${lineNumber} 超出范围 (1-${lines.length})`);
        return null;
      }

      const lineElement = lines[lineNumber - 1];
      const text = lineElement.textContent || lineElement.innerHTML;
      return text ?? '';
    } catch (error) {
      console.error('读取行文字时出错:', error);
      return null;
    }
  }

  readAllLines(): string[] {
    try {
      const lines = document.querySelectorAll('.cm-line');
      const result: string[] = [];

      lines.forEach((line) => {
        const text = line.textContent || (line as HTMLElement).innerText || '';
        result.push(text);
      });

      return result;
    } catch (error) {
      console.error('读取所有行时出错:', error);
      return [];
    }
  }

  getEditorFullText(targetFileName?: string): string {
    try {
      let cmContent: HTMLElement | null = null;

      if (targetFileName) {
        const editors = document.querySelectorAll('.cm-editor');
        for (const editor of Array.from(editors)) {
          const breadcrumbs = editor.querySelectorAll('.ol-cm-breadcrumbs, .breadcrumbs');
          for (const breadcrumb of Array.from(breadcrumbs)) {
            const nameElement = breadcrumb.querySelector('div:last-child');
            const name = nameElement?.textContent?.trim();
            if (name && name === targetFileName) {
              cmContent = editor.querySelector('.cm-content');
              break;
            }
          }
          if (cmContent) break;
        }
      }

      if (!cmContent) {
        cmContent = document.querySelector('.cm-content');
      }

      if (!cmContent) {
        console.error('未找到 .cm-content 元素');
        return '';
      }

      return cmContent.textContent || (cmContent as HTMLElement).innerText || '';
    } catch (error) {
      console.error('读取完整文本时出错:', error);
      return '';
    }
  }

  readFileOutline(): OutlineItem[] {
    try {
      const outlineItems = document.querySelectorAll('.outline-item');
      if (outlineItems.length > 0) {
        return this.parseOutlineItems(outlineItems);
      }

      const alternativeSelectors = [
        '[role="treeitem"]',
        '.file-outline-item',
        '[data-type="outline-item"]',
        '.outline-container .outline-entry',
        '.document-outline-item'
      ];

      for (const selector of alternativeSelectors) {
        const items = document.querySelectorAll(selector);
        if (items.length > 0) {
          return this.parseOutlineItems(items);
        }
      }

      return [];
    } catch (error) {
      console.error('读取 File Outline 时出错:', error);
      return [];
    }
  }

  readFileTree(): FileTreeItem[] {
    try {
      const fileTreeContainer = document.querySelector('.file-tree, .file-tree-inner, .file-tree-list');

      if (fileTreeContainer) {
        const fileItems = fileTreeContainer.querySelectorAll('li[role="treeitem"]');
        if (fileItems.length > 0) {
          return this.parseFileTreeItems(fileItems);
        }
      }

      const entityItems = document.querySelectorAll('.entity[data-file-id]');
      if (entityItems.length > 0) {
        const fileItems = Array.from(entityItems)
          .map((entity) => (entity as HTMLElement).closest('li[role="treeitem"]'))
          .filter((li): li is Element => li !== null);

        if (fileItems.length > 0) {
          return this.parseFileTreeItems(fileItems);
        }
      }

      const alternativeSelectors = ['.file-tree-item', '[data-type="fileItem"]', '.entity-item'];

      for (const selector of alternativeSelectors) {
        const items = document.querySelectorAll(selector);
        if (items.length > 0) {
          return this.parseFileTreeItems(items);
        }
      }

      return [];
    } catch (error) {
      console.error('读取 File Tree 时出错:', error);
      return [];
    }
  }

  async readImagePreviewUrl(fileName: string): Promise<string | null> {
    try {
      const opened = this.openFileInEditor(fileName);

      if (!opened) {
        console.error(`在文件树中未找到 ${fileName}`);
        return null;
      }

      await this.sleep(1500);

      let targetImg: HTMLImageElement | null = null;
      const imgs = document.querySelectorAll('img');
      imgs.forEach((img) => {
        if (targetImg) return;
        const alt = img.getAttribute('alt') || '';
        const src = img.getAttribute('src') || '';
        if (alt.includes(fileName) || src.includes(fileName.split('.')[0])) {
          targetImg = img as HTMLImageElement;
        }
      });

      if (!targetImg) {
        console.error('未在页面中找到图片预览');
        return null;
      }

      const src = targetImg.getAttribute('src') || targetImg.src || '';
      return src || null;
    } catch (error) {
      console.error('读取图片预览地址失败:', error);
      return null;
    }
  }

  private parseOutlineItems(items: NodeListOf<Element> | Element[]): OutlineItem[] {
    const result: OutlineItem[] = [];

    items.forEach((item) => {
      const titleLink = item.querySelector(':scope > .outline-item-row > .outline-item-link') as HTMLElement | null;
      if (!titleLink) return;

      let title = titleLink.textContent?.trim() || '';
      title = title.replace(/\s+/g, ' ').trim();

      const ariaLabel = item.getAttribute('aria-label');
      if (ariaLabel) {
        title = ariaLabel.trim();
      }

      let line =
        item.getAttribute('data-line') ||
        item.getAttribute('line') ||
        item.getAttribute('data-line-number') ||
        titleLink.getAttribute('data-line') ||
        titleLink.getAttribute('data-line-number');

      let type = 'section';
      const lowerTitle = title.toLowerCase();
      if (lowerTitle.includes('chapter')) {
        type = 'chapter';
      } else if (lowerTitle.includes('subsection')) {
        type = 'subsection';
      }

      let level = 0;
      let parent = item.parentElement;
      while (parent && !parent.classList.contains('outline-item-list-root')) {
        if (parent.classList.contains('outline-item-list')) {
          level++;
        }
        parent = parent.parentElement;
      }

      if (title && title.length > 0) {
        result.push({
          title,
          type,
          line: line || '未知',
          level
        });
      }
    });

    return result;
  }

  private parseFileTreeItems(items: NodeListOf<Element> | Element[]): FileTreeItem[] {
    const result: FileTreeItem[] = [];

    items.forEach((item) => {
      let name = item.getAttribute('aria-label') || '';

      if (!name) {
        const nameElement = item.querySelector('.item-name-button > span') as HTMLElement | null;
        if (nameElement) {
          name = nameElement.textContent?.trim() || '';
        }
      }

      if (!name) {
        const nameElement = item.querySelector('.entity-name, .file-tree-item-name') as HTMLElement | null;
        if (nameElement) {
          const cloned = nameElement.cloneNode(true) as HTMLElement;
          const icons = cloned.querySelectorAll('.material-symbols, [class*="icon"]');
          icons.forEach((icon) => icon.remove());
          name = cloned.textContent?.trim() || '';
        }
      }

      if (!name) return;

      name = name.replace(/\s+/g, ' ').trim();

      const entity = item.querySelector('.entity[data-file-type]') as HTMLElement | null;
      let type = 'file';
      let fileType = '';

      if (entity) {
        const dataType = entity.getAttribute('data-file-type');
        if (dataType === 'folder') {
          type = 'folder';
        } else if (dataType) {
          fileType = dataType;
        }
      }

      const isFolder =
        item.classList.contains('folder') ||
        item.classList.contains('directory') ||
        item.getAttribute('aria-expanded') !== null;

      if (isFolder) {
        type = 'folder';
      }

      let level = 0;
      const ariaLevel = item.getAttribute('aria-level');
      if (ariaLevel) {
        level = parseInt(ariaLevel, 10) - 1;
      } else {
        let parent = item.parentElement;
        while (parent && !parent.classList.contains('file-tree')) {
          if (parent.tagName === 'UL' || parent.tagName === 'OL') {
            level++;
          }
          parent = parent.parentElement;
        }
      }

      if (name && name.length > 0) {
        result.push({
          name,
          type,
          level,
          fileType
        });
      }
    });

    return result;
  }

  private openFileInEditor(fileName: string): boolean {
    try {
      const fileItems = document.querySelectorAll('li[role="treeitem"]');

      for (const item of Array.from(fileItems)) {
        const itemLabel = item.getAttribute('aria-label');
        if (itemLabel && itemLabel.includes(fileName)) {
          const fileLink = item.querySelector('.outline-item-link, .item-name-button, button');
          if (fileLink) {
            (fileLink as HTMLElement).click();
            return true;
          }
        }
      }

      return false;
    } catch (error) {
      console.error('打开文件时出错:', error);
      return false;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

