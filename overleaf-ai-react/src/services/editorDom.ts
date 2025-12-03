export type OutlineItem = { title: string; type: string; line: string | number; level: number };
export type FileTreeItem = { name: string; type: string; level: number; fileType: string };

export function readLineText(lineNumber: number): string | null {
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

export function readAllLines(): string[] {
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

export function getEditorFullText(targetFileName?: string): string {
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

export function insertTextViaDom(element: HTMLElement, text: string) {
  try {
    element.focus();

    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) {
      console.error('没有选区');
      return;
    }

    const range = selection.getRangeAt(0);
    range.deleteContents();
    const textNode = document.createTextNode(text);
    range.insertNode(textNode);
    range.setStartAfter(textNode);
    range.setEndAfter(textNode);
    selection.removeAllRanges();
    selection.addRange(range);

    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  } catch (error) {
    console.error('DOM 插入失败:', error);
  }
}

export function findCodeMirror6Editor(): any {
  let editorElement: any = document.querySelector('.cm-editor');

  if (!editorElement) {
    const iframes = document.querySelectorAll('iframe');
    for (const iframe of Array.from(iframes)) {
      try {
        const iframeDoc = (iframe as HTMLIFrameElement).contentDocument || (iframe as HTMLIFrameElement).contentWindow?.document;
        editorElement = iframeDoc?.querySelector('.cm-editor');
        if (editorElement) break;
      } catch {
        /* ignore cross-origin */
      }
    }
  }

  if (!editorElement) {
    console.log('未找到 .cm-editor 元素');
    return null;
  }

  for (const key in editorElement) {
    if (key.startsWith('__cm6') || key.includes('cmView') || key.includes('CodeMirror')) {
      return (editorElement as any)[key];
    }
  }

  if ((window as any).cmEditor) {
    return (window as any).cmEditor;
  }

  if ((editorElement as any).view) {
    return (editorElement as any).view;
  }

  console.log('未能找到 CM6 EditorView 实例');
  return null;
}

export function findCodeMirror5Editor(): any {
  let editorElement: any = document.querySelector('.CodeMirror');

  if (!editorElement) {
    const iframes = document.querySelectorAll('iframe');
    for (const iframe of Array.from(iframes)) {
      try {
        const iframeDoc = (iframe as HTMLIFrameElement).contentDocument || (iframe as HTMLIFrameElement).contentWindow?.document;
        editorElement = iframeDoc?.querySelector('.CodeMirror');
        if (editorElement) break;
      } catch {
        /* ignore cross-origin */
      }
    }
  }

  if (!editorElement) return null;
  return (editorElement as any).CodeMirror || null;
}

export function findAceEditor(): any {
  let editorElement: any = document.querySelector('.ace_editor');

  if (!editorElement) {
    const iframes = document.querySelectorAll('iframe');
    for (const iframe of Array.from(iframes)) {
      try {
        const iframeDoc = (iframe as HTMLIFrameElement).contentDocument || (iframe as HTMLIFrameElement).contentWindow?.document;
        editorElement = iframeDoc?.querySelector('.ace_editor');
        if (editorElement) break;
      } catch {
        /* ignore cross-origin */
      }
    }
  }

  if (!editorElement) return null;
  return (editorElement as any).env?.editor || null;
}

export function insertTextToCM6(editor: any, text: string) {
  try {
    const { state, dispatch } = editor;
    const selection = state.selection.main;

    dispatch({
      changes: {
        from: selection.from,
        to: selection.to,
        insert: text
      },
      selection: {
        anchor: selection.from + text.length
      }
    });
  } catch (error) {
    console.error('CodeMirror 6 插入失败:', error);
  }
}

export function insertTextToCM5(editor: any, text: string) {
  try {
    const cursor = editor.getCursor();
    editor.replaceRange(text, cursor);
    editor.setCursor({
      line: cursor.line,
      ch: cursor.ch + text.length
    });
    editor.focus();
  } catch (error) {
    console.error('CodeMirror 5 插入失败:', error);
  }
}

export function insertTextToAce(editor: any, text: string) {
  try {
    editor.insert(text);
    editor.focus();
  } catch (error) {
    console.error('Ace 编辑器插入失败:', error);
  }
}

export function getCurrentFileName(): string | null {
  try {
    const breadcrumb = document.querySelector('.ol-cm-breadcrumbs, .breadcrumbs');
    if (breadcrumb) {
      const fileNameElement = breadcrumb.querySelector('div:last-child');
      const text = fileNameElement?.textContent?.trim();
      if (text) return text;
    }

    const selectedItem = document.querySelector('li[role="treeitem"].selected, li[role="treeitem"][aria-selected="true"]');
    if (selectedItem) {
      return selectedItem.getAttribute('aria-label');
    }

    return null;
  } catch (error) {
    console.error('获取当前文件名时出错:', error);
    return null;
  }
}

export function openFileInEditor(fileName: string): boolean {
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

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function readFileContentAsync(fileName: string): Promise<string | null> {
  try {
    const currentFileName = getCurrentFileName();

    if (currentFileName === fileName) {
      return getEditorFullText(fileName);
    }

    const opened = openFileInEditor(fileName);

    if (opened) {
      await sleep(1500);

      const newFileName = getCurrentFileName();
      if (newFileName === fileName) {
        return getEditorFullText(fileName);
      }
      return null;
    }

    return null;
  } catch (error) {
    console.error('读取文件内容时出错:', error);
    return null;
  }
}

const parseOutlineItems = (items: NodeListOf<Element> | Element[]): OutlineItem[] => {
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
};

export function readFileOutline(): OutlineItem[] {
  try {
    const outlineItems = document.querySelectorAll('.outline-item');
    if (outlineItems.length > 0) {
      return parseOutlineItems(outlineItems);
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
        return parseOutlineItems(items);
      }
    }

    return [];
  } catch (error) {
    console.error('读取 File Outline 时出错:', error);
    return [];
  }
}

const parseFileTreeItems = (items: NodeListOf<Element> | Element[]): FileTreeItem[] => {
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
};

export function readFileTree(): FileTreeItem[] {
  try {
    const fileTreeContainer = document.querySelector('.file-tree, .file-tree-inner, .file-tree-list');

    if (fileTreeContainer) {
      const fileItems = fileTreeContainer.querySelectorAll('li[role="treeitem"]');
      if (fileItems.length > 0) {
        return parseFileTreeItems(fileItems);
      }
    }

    const entityItems = document.querySelectorAll('.entity[data-file-id]');
    if (entityItems.length > 0) {
      const fileItems = Array.from(entityItems)
        .map((entity) => (entity as HTMLElement).closest('li[role="treeitem"]'))
        .filter((li): li is Element => li !== null);

      if (fileItems.length > 0) {
        return parseFileTreeItems(fileItems);
      }
    }

    const alternativeSelectors = ['.file-tree-item', '[data-type="fileItem"]', '.entity-item'];

    for (const selector of alternativeSelectors) {
      const items = document.querySelectorAll(selector);
      if (items.length > 0) {
        return parseFileTreeItems(items);
      }
    }

    return [];
  } catch (error) {
    console.error('读取 File Tree 时出错:', error);
    return [];
  }
}
