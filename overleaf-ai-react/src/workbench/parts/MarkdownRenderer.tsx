import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

/**
 * 预处理 LaTeX 公式语法
 * 将 \( ... \) 转换为 $...$（行内公式）
 * 将 \[ ... \] 转换为 $$...$$（块级公式）
 */
function preprocessLatex(content: string): string {
  // 先处理块级公式 \[ ... \]，避免与行内公式混淆
  // 使用非贪婪匹配，支持多行
  let processed = content.replace(/\\\[([\s\S]*?)\\\]/g, (_, formula) => {
    return `$$${formula}$$`;
  });
  
  // 处理行内公式 \( ... \)
  processed = processed.replace(/\\\(([\s\S]*?)\\\)/g, (_, formula) => {
    return `$${formula}$`;
  });
  
  return processed;
}

/**
 * Markdown 渲染组件
 * 支持：
 * - 标准 Markdown 语法（标题、加粗、斜体、列表等）
 * - GFM 扩展（表格、删除线、任务列表等）
 * - LaTeX 数学公式（行内 $...$ / \(...\) 和块级 $$...$$ / \[...\]）
 * - 代码高亮
 */
export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className }) => {
  // 预处理内容，转换 LaTeX 公式语法
  const processedContent = useMemo(() => preprocessLatex(content), [content]);
  // 自定义渲染组件
  const components: Components = useMemo(() => ({
    // 代码块渲染
    code: ({ node, className: codeClassName, children, ...props }) => {
      const match = /language-(\w+)/.exec(codeClassName || '');
      const isInline = !match && !codeClassName;
      
      if (isInline) {
        return (
          <code className="inline-code" {...props}>
            {children}
          </code>
        );
      }
      
      return (
        <div className="code-block-wrapper">
          {match && (
            <div className="code-block-header">
              <span className="code-language">{match[1]}</span>
            </div>
          )}
          <pre className="code-block">
            <code className={codeClassName} {...props}>
              {children}
            </code>
          </pre>
        </div>
      );
    },
    // 链接渲染 - 在新标签页打开
    a: ({ node, children, href, ...props }) => (
      <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
        {children}
      </a>
    ),
    // 表格渲染
    table: ({ node, children, ...props }) => (
      <div className="table-wrapper">
        <table {...props}>{children}</table>
      </div>
    ),
    // 图片渲染
    img: ({ node, src, alt, ...props }) => (
      <img 
        src={src} 
        alt={alt || ''} 
        className="markdown-image"
        loading="lazy"
        {...props}
      />
    ),
    // 块引用
    blockquote: ({ node, children, ...props }) => (
      <blockquote className="markdown-blockquote" {...props}>
        {children}
      </blockquote>
    ),
  }), []);

  return (
    <div className={`markdown-content ${className || ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkMath, remarkGfm]}
        rehypePlugins={[rehypeKatex]}
        components={components}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownRenderer;

