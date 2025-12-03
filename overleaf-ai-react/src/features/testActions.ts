import { escapeHtml } from '../utils/html';
import {
  findAceEditor,
  findCodeMirror5Editor,
  findCodeMirror6Editor,
  getCurrentFileName,
  getEditorFullText,
  insertTextToAce,
  insertTextToCM5,
  insertTextToCM6,
  insertTextViaDom,
  openFileInEditor,
  readFileContentAsync,
  readFileOutline,
  readFileTree,
  readLineText,
  sleep
} from '../services/editorDom';
import { ChatMessage } from '../types/chat';

type AppendMessage = (role: ChatMessage['role'], content: string, isHtml?: boolean) => void;

export function createTestActions(appendMessage: AppendMessage) {
  const testReadText = () => {
    console.log('开始读取文字功能');

    try {
      const lineNumber = 3;
      const text = readLineText(lineNumber);

      if (text !== null) {
        console.log(`✅ 第 ${lineNumber} 行的内容: "${text}"`);
        appendMessage('bot', `第 ${lineNumber} 行: ${text}`);
      } else {
        console.error(`❌ 无法读取第 ${lineNumber} 行`);
      }
    } catch (error) {
      console.error('读取文字失败:', error);
    }
  };

  const testInsertText = () => {
    console.log('开始插入文字功能');

    try {
      const cmContent = document.querySelector('.cm-content[contenteditable="true"]') as HTMLElement | null;
      if (cmContent) {
        console.log('找到 .cm-content 可编辑区域，使用 DOM 方法插入');
        insertTextViaDom(cmContent, 'abcd');
        return;
      }

      const cm6Editor = findCodeMirror6Editor();
      if (cm6Editor) {
        console.log('找到 CodeMirror 6 编辑器');
        insertTextToCM6(cm6Editor, 'abcd');
        return;
      }

      const cm5Editor = findCodeMirror5Editor();
      if (cm5Editor) {
        console.log('找到 CodeMirror 5 编辑器');
        insertTextToCM5(cm5Editor, 'abcd');
        return;
      }

      const aceEditor = findAceEditor();
      if (aceEditor) {
        console.log('找到 Ace 编辑器');
        insertTextToAce(aceEditor, 'abcd');
        return;
      }

      console.error('未找到任何编辑器');
    } catch (error) {
      console.error('插入文字失败:', error);
    }
  };

  const testReplaceText = () => {
    console.log('TODO: 实现替换文字功能');
  };

  const testDeleteText = () => {
    console.log('TODO: 实现删除文字功能');
  };

  const testReadOutline = () => {
    console.log('开始读取 File Outline');

    try {
      const outlineData = readFileOutline();

      if (outlineData && outlineData.length > 0) {
        console.log('✅ File Outline 内容:');
        outlineData.forEach((item, index) => {
          const indent = '  '.repeat(item.level);
          console.log(`${indent}${index + 1}. ${item.title}`);
        });

        let message = '<div><strong>File Outline:</strong><br>';
        outlineData.forEach((item, index) => {
          const indent = '&nbsp;&nbsp;'.repeat(item.level);
          message += `${indent}${index + 1}. ${escapeHtml(item.title)}<br>`;
        });
        message += '</div>';
        appendMessage('bot', message, true);
      } else {
        console.log('未找到 Outline 内容');
      }
    } catch (error) {
      console.error('读取 Outline 失败:', error);
    }
  };

  const testReadFileTree = () => {
    console.log('开始读取 File Tree');

    try {
      const fileTree = readFileTree();

      if (fileTree && fileTree.length > 0) {
        console.log('✅ File Tree 内容:');
        fileTree.forEach((item, index) => {
          const indent = '  '.repeat(item.level);
          const icon = item.type === 'folder' ? '📁' : '📄';
          console.log(`  ${indent}${icon} ${item.name}`);
        });

        let message = '<div><strong>File Tree:</strong><br>';
        fileTree.forEach((item) => {
          const indent = '&nbsp;&nbsp;'.repeat(item.level);
          const icon = item.type === 'folder' ? '📁' : '📄';
          message += `${indent}${icon} ${escapeHtml(item.name)}<br>`;
        });
        message += '</div>';
        appendMessage('bot', message, true);
      } else {
        console.log('未找到 File Tree 内容');
      }
    } catch (error) {
      console.error('读取 File Tree 失败:', error);
    }
  };

  const testReadFig4Image = async () => {
    console.log('开始读取 fig4.png 图片');
    try {
      const fileName = 'fig4.png';
      const opened = openFileInEditor(fileName);

      if (!opened) {
        console.error(`在文件树中未找到 ${fileName}`);
        appendMessage('bot', `❌ 在 File Tree 中未找到 ${fileName}`);
        return;
      }

      console.log('已点击打开 fig4.png，等待预览加载...');
      await sleep(1500);

      let targetImg: HTMLImageElement | null = null;
      const imgs = document.querySelectorAll('img');
      imgs.forEach((img) => {
        if (targetImg) return;
        const alt = img.getAttribute('alt') || '';
        const src = img.getAttribute('src') || '';
        if (alt.includes(fileName) || src.includes('fig4')) {
          targetImg = img as HTMLImageElement;
        }
      });

      if (!targetImg) {
        console.error('未在页面中找到 fig4.png 的图片预览');
        appendMessage('bot', `已尝试打开 ${fileName}，但未在页面中找到图片预览`);
        return;
      }

      const src = targetImg.getAttribute('src') || targetImg.src || '';
      if (src) {
        const safeSrc = escapeHtml(src);
        const message = `<div><strong>${fileName} 图片预览：</strong><br><img src="${safeSrc}" alt="${fileName}" style="max-width: 100%; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.2);"></div>`;
        appendMessage('bot', message, true);
      }

      console.log(`✅ 已在侧边栏展示 ${fileName} 图片`);
    } catch (error) {
      console.error('读取 fig4.png 图片失败:', error);
    }
  };

  const testReadBibFile = async () => {
    console.log('开始读取 Mybib.bib 文件');

    try {
      const fileName = 'Mybib.bib';
      const content = await readFileContentAsync(fileName);

      if (content) {
        console.log(`✅ 成功读取 ${fileName}:`);
        console.log(content);

        const preview = content.length > 500 ? `${content.substring(0, 500)}...` : content;
        const html = `<div><strong>${fileName} 内容：</strong><br><pre style="background: #f5f5f5; padding: 10px; border-radius: 4px; overflow-x: auto; font-size: 11px;">${escapeHtml(preview)}</pre><small>共 ${content.length} 字符</small></div>`;
        appendMessage('bot', html, true);
      } else {
        console.error(`❌ 无法读取 ${fileName}`);
        appendMessage('bot', `❌ 无法读取 ${fileName}，请先在编辑器中手动点击打开该文件，然后再点击此按钮`);
      }
    } catch (error) {
      console.error('读取 bib 文件失败:', error);
    }
  };

  const testReadCurrentFile = () => {
    const fileName = getCurrentFileName();
    const content = fileName ? getEditorFullText(fileName) : '';
    appendMessage('bot', fileName ? `${fileName}: ${content.slice(0, 100)}...` : '未获取到文件名');
  };

  return {
    read: testReadText,
    insert: testInsertText,
    replace: testReplaceText,
    delete: testDeleteText,
    readOutline: testReadOutline,
    readFileTree: testReadFileTree,
    readFig4Image: testReadFig4Image,
    readBibFile: testReadBibFile,
    readCurrentFile: testReadCurrentFile
  };
}
