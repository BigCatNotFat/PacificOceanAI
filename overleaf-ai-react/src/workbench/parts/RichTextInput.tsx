import React, { useRef, useImperativeHandle, forwardRef, useCallback } from 'react';
import { overleafEditor } from '../../services/editor/OverleafEditor';

// 文件引用数据结构
export interface FileReference {
  fileName: string;
  startLine: number;
  endLine: number;
  originalText: string;  // 保存原始文本，方便后续使用
}

// 组件对外暴露的方法
export interface RichTextInputHandle {
  getValue: () => string;
  getValueWithReferences: () => { text: string; references: FileReference[] };
  setValue: (value: string) => void;
  clear: () => void;
  focus: () => void;
  insertText: (text: string) => void;
  insertReference: (ref: FileReference) => void;
}

interface RichTextInputProps {
  placeholder?: string;
  disabled?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  className?: string;
}

const RichTextInput = forwardRef<RichTextInputHandle, RichTextInputProps>(
  ({ placeholder, disabled, onKeyDown, className }, ref) => {
    const editorRef = useRef<HTMLDivElement>(null);

    // 创建引用标签元素
    const createReferenceElement = useCallback((fileRef: FileReference): HTMLSpanElement => {
      const span = document.createElement('span');
      span.className = 'ai-file-reference';
      span.contentEditable = 'false';  // 标签本身不可编辑
      span.dataset.fileName = fileRef.fileName;
      span.dataset.startLine = String(fileRef.startLine);
      span.dataset.endLine = String(fileRef.endLine);
      span.dataset.originalText = fileRef.originalText;
      
      // 显示文本
      const displayText = fileRef.startLine === fileRef.endLine
        ? `${fileRef.fileName}:L${fileRef.startLine}`
        : `${fileRef.fileName}:L${fileRef.startLine}-${fileRef.endLine}`;
      
      span.innerHTML = `<span class="ai-ref-icon">📄</span><span class="ai-ref-text">${displayText}</span>`;
      
      return span;
    }, []);

    // 在光标位置插入节点
    const insertNodeAtCursor = useCallback((node: Node) => {
      const editor = editorRef.current;
      if (!editor) return;

      editor.focus();
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        editor.appendChild(node);
        return;
      }

      const range = selection.getRangeAt(0);
      range.deleteContents();
      range.insertNode(node);

      // 在节点后插入一个空格，方便继续输入
      const space = document.createTextNode('\u00A0');
      range.setStartAfter(node);
      range.insertNode(space);

      // 移动光标到空格后
      range.setStartAfter(space);
      range.setEndAfter(space);
      selection.removeAllRanges();
      selection.addRange(range);
    }, []);

    // 获取纯文本内容（将引用标签转换为特殊格式）
    const getValue = useCallback((): string => {
      const editor = editorRef.current;
      if (!editor) return '';

      const cloned = editor.cloneNode(true) as HTMLElement;
      
      // 将引用标签转换为特殊格式文本
      const refs = cloned.querySelectorAll('.ai-file-reference');
      refs.forEach((refEl) => {
        const fileName = refEl.getAttribute('data-file-name') || '未知文件';
        const startLine = refEl.getAttribute('data-start-line') || '?';
        const endLine = refEl.getAttribute('data-end-line') || '?';
        const text = startLine === endLine
          ? `[[REF:${fileName}:${startLine}]]`
          : `[[REF:${fileName}:${startLine}-${endLine}]]`;
        refEl.replaceWith(document.createTextNode(text));
      });

      return cloned.textContent?.trim() || '';
    }, []);

    // 获取内容和引用列表
    const getValueWithReferences = useCallback((): { text: string; references: FileReference[] } => {
      const editor = editorRef.current;
      if (!editor) return { text: '', references: [] };

      const references: FileReference[] = [];
      const cloned = editor.cloneNode(true) as HTMLElement;
      
      // 收集所有引用并转换
      const refs = cloned.querySelectorAll('.ai-file-reference');
      refs.forEach((refEl, index) => {
        const fileName = refEl.getAttribute('data-file-name') || '未知文件';
        const startLine = parseInt(refEl.getAttribute('data-start-line') || '0', 10);
        const endLine = parseInt(refEl.getAttribute('data-end-line') || '0', 10);
        const originalText = refEl.getAttribute('data-original-text') || '';
        
        references.push({ fileName, startLine, endLine, originalText });
        
        // 用占位符替换
        refEl.replaceWith(document.createTextNode(`{{REF_${index}}}`));
      });

      return {
        text: cloned.textContent?.trim() || '',
        references
      };
    }, []);

    // 设置内容
    const setValue = useCallback((value: string) => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.textContent = value;
    }, []);

    // 清空内容
    const clear = useCallback(() => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.innerHTML = '';
    }, []);

    // 聚焦
    const focus = useCallback(() => {
      editorRef.current?.focus();
    }, []);

    // 插入纯文本
    const insertText = useCallback((text: string) => {
      const editor = editorRef.current;
      if (!editor) return;

      editor.focus();
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        editor.appendChild(document.createTextNode(text));
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
    }, []);

    // 插入引用标签
    const insertReference = useCallback((fileRef: FileReference) => {
      const element = createReferenceElement(fileRef);
      insertNodeAtCursor(element);
    }, [createReferenceElement, insertNodeAtCursor]);

    // 暴露方法给父组件
    useImperativeHandle(ref, () => ({
      getValue,
      getValueWithReferences,
      setValue,
      clear,
      focus,
      insertText,
      insertReference
    }), [getValue, getValueWithReferences, setValue, clear, focus, insertText, insertReference]);

    // 处理粘贴事件
    const handlePaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
      const pastedText = e.clipboardData.getData('text');
      
      // 只处理较长的文本（至少 20 字符），避免短文本误匹配
      if (!pastedText || pastedText.length < 20) {
        // 短文本：仅粘贴纯文本，阻止富文本
        e.preventDefault();
        insertText(pastedText);
        return;
      }
      
      // 阻止默认粘贴
      e.preventDefault();
      
      // 异步检测是否在文件中
      (async () => {
        try {
          const fileContent = await overleafEditor.document.getText();
          const fileInfo = await overleafEditor.file.getInfo();
          const fileName = fileInfo.fileName;
          
          // 如果无法获取文件内容或真实文件名，直接粘贴原文
          if (!fileContent || !fileName) {
            console.log('[RichTextInput] 无法获取文件内容或文件名，粘贴原文');
            insertText(pastedText);
            return;
          }
          
          const normalizedPasted = pastedText.trim();
          const matchIndex = fileContent.indexOf(normalizedPasted);
          
          if (matchIndex === -1) {
            insertText(pastedText);
            return;
          }
          
          // 检查是否是完整的行：
          // 1. 匹配开始位置必须是行首（前面是换行符或文件开头）
          // 2. 匹配结束位置必须是行尾（后面是换行符或文件结尾）
          const charBefore = matchIndex === 0 ? '\n' : fileContent[matchIndex - 1];
          const matchEnd = matchIndex + normalizedPasted.length;
          const charAfter = matchEnd >= fileContent.length ? '\n' : fileContent[matchEnd];
          
          const isStartOfLine = charBefore === '\n';
          const isEndOfLine = charAfter === '\n';
          
          // 如果不是完整的行，则粘贴原文
          if (!isStartOfLine || !isEndOfLine) {
            console.log('[RichTextInput] 粘贴内容不是完整的行，保留原文');
            insertText(pastedText);
            return;
          }
          
          // 计算行号
          const beforeMatch = fileContent.substring(0, matchIndex);
          const startLine = (beforeMatch.match(/\n/g) || []).length + 1;
          const matchedLines = (normalizedPasted.match(/\n/g) || []).length;
          const endLine = startLine + matchedLines;
          
          // 插入引用标签
          insertReference({
            fileName,
            startLine,
            endLine,
            originalText: normalizedPasted
          });
          
          console.log(`[RichTextInput] 智能粘贴: 创建引用 ${fileName}:${startLine}-${endLine}`);
        } catch (error) {
          console.error('[RichTextInput] 智能粘贴失败:', error);
          insertText(pastedText);
        }
      })();
    }, [insertText, insertReference]);

    // 处理键盘事件
    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
      // 处理 Backspace 删除引用标签
      if (e.key === 'Backspace') {
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          if (range.collapsed) {
            // 检查前一个节点是否是引用标签
            const node = range.startContainer;
            if (node.nodeType === Node.TEXT_NODE && range.startOffset === 0) {
              const prev = node.previousSibling;
              if (prev && prev instanceof HTMLElement && prev.classList.contains('ai-file-reference')) {
                e.preventDefault();
                prev.remove();
                return;
              }
            }
          }
        }
      }
      
      // 传递给父组件的 onKeyDown
      onKeyDown?.(e);
    }, [onKeyDown]);

    return (
      <div
        ref={editorRef}
        className={`ai-rich-input ${className || ''}`}
        contentEditable={!disabled}
        suppressContentEditableWarning
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
        data-placeholder={placeholder}
        role="textbox"
        aria-multiline="true"
        aria-disabled={disabled}
      />
    );
  }
);

RichTextInput.displayName = 'RichTextInput';

export default RichTextInput;

