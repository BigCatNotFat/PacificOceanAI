/**
 * ToolResultRenderer - 工具结果美化渲染组件
 * 
 * 根据不同工具类型，将 JSON 结果转换为友好的可视化展示
 */

import React from 'react';

interface ToolResultRendererProps {
  toolName: string;
  result: string | undefined;
}

/**
 * 尝试解析 JSON 字符串
 */
function tryParseJSON(str: string | undefined): any {
  if (!str) return null;
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

/**
 * 文件图标映射
 */
function getFileIcon(fileName: string, type: string): string {
  if (type === 'directory') return 'folder';
  
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'tex':
      return 'description';
    case 'bib':
      return 'library_books';
    case 'cls':
    case 'sty':
      return 'settings';
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'pdf':
      return 'image';
    default:
      return 'draft';
  }
}

/**
 * 列出目录结果渲染
 */
const ListDirResult: React.FC<{ data: any }> = ({ data }) => {
  if (!data || !data.items) {
    return <div className="tool-result-empty">没有找到文件或文件夹</div>;
  }

  const folders = data.items.filter((item: any) => item.type === 'directory');
  const files = data.items.filter((item: any) => item.type === 'file');

  return (
    <div className="tool-result-list-dir">
      <div className="tool-result-header">
        <span className="material-symbols">folder_open</span>
        <span className="tool-result-path">{data.path || '/'}</span>
        <span className="tool-result-count">{data.total_items} 项</span>
      </div>
      
      <div className="tool-result-items">
        {folders.map((item: any, index: number) => (
          <div key={`folder-${index}`} className="tool-result-item folder">
            <span className="material-symbols item-icon">folder</span>
            <span className="item-name">{item.name}</span>
          </div>
        ))}
        {files.map((item: any, index: number) => (
          <div key={`file-${index}`} className="tool-result-item file">
            <span className="material-symbols item-icon">{getFileIcon(item.name, item.type)}</span>
            <span className="item-name">{item.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * 智能截断内容：保留开头和结尾，中间截断
 */
function smartTruncateContent(content: string, maxLength: number = 600): { content: string; truncated: boolean } {
  if (!content || content.length <= maxLength) {
    return { content, truncated: false };
  }

  const lines = content.split('\n');
  
  // 如果行数不多，按字符截断
  if (lines.length <= 20) {
    const headLength = Math.floor(maxLength * 0.6);
    const tailLength = Math.floor(maxLength * 0.3);
    const head = content.substring(0, headLength);
    const tail = content.substring(content.length - tailLength);
    return {
      content: head + '\n\n... ✂️ 中间内容已省略 ...\n\n' + tail,
      truncated: true
    };
  }

  // 按行截断：保留前面一部分行和后面一部分行
  const headLines = Math.ceil(lines.length * 0.4);  // 前40%
  const tailLines = Math.ceil(lines.length * 0.2);  // 后20%
  const maxHeadLines = 15;
  const maxTailLines = 8;
  
  const actualHeadLines = Math.min(headLines, maxHeadLines);
  const actualTailLines = Math.min(tailLines, maxTailLines);
  
  const headPart = lines.slice(0, actualHeadLines).join('\n');
  const tailPart = lines.slice(-actualTailLines).join('\n');
  const omittedLines = lines.length - actualHeadLines - actualTailLines;

  return {
    content: headPart + `\n\n... ✂️ 省略了 ${omittedLines} 行 ...\n\n` + tailPart,
    truncated: true
  };
}

/**
 * 读取文件结果渲染
 */
const ReadFileResult: React.FC<{ data: any }> = ({ data }) => {
  if (!data) {
    return <div className="tool-result-empty">无法读取文件内容</div>;
  }

  const { content: displayContent, truncated: isDisplayTruncated } = smartTruncateContent(data.content);

  return (
    <div className="tool-result-read-file">
      <div className="tool-result-header">
        <span className="material-symbols">description</span>
        <span className="tool-result-filename">{data.file}</span>
      </div>
      
      <div className="tool-result-file-info">
        <span className="info-item">
          <span className="material-symbols">format_list_numbered</span>
          {data.totalLines} 行
        </span>
        <span className="info-item">
          <span className="material-symbols">data_array</span>
          {data.startLine}-{data.endLine} 行
        </span>
        {(data.truncated || isDisplayTruncated) && (
          <span className="info-item warning">
            <span className="material-symbols">content_cut</span>
            已截断
          </span>
        )}
      </div>

      {displayContent && (
        <div className="tool-result-code">
          <pre>{displayContent}</pre>
        </div>
      )}
      
      {data.summary && (
        <div className="tool-result-summary">{data.summary}</div>
      )}
    </div>
  );
};

/**
 * 搜索结果渲染
 */
const GrepSearchResult: React.FC<{ data: any }> = ({ data }) => {
  if (!data) {
    return <div className="tool-result-empty">搜索未返回结果</div>;
  }

  if (data.total_matches === 0) {
    return (
      <div className="tool-result-grep-search">
        <div className="tool-result-header">
          <span className="material-symbols">search</span>
          <span className="tool-result-query">"{data.query}"</span>
        </div>
        <div className="tool-result-no-match">
          <span className="material-symbols">search_off</span>
          未找到匹配项
        </div>
      </div>
    );
  }

  return (
    <div className="tool-result-grep-search">
      <div className="tool-result-header">
        <span className="material-symbols">search</span>
        <span className="tool-result-query">"{data.query}"</span>
        <span className="tool-result-count">{data.total_matches} 个匹配</span>
      </div>

      <div className="tool-result-stats">
        <span className="stat-item">
          <span className="material-symbols">folder</span>
          {data.file_count} 个文件
        </span>
      </div>

      {data.results && data.results.length > 0 && (
        <div className="tool-result-matches">
          {data.results.slice(0, 5).map((file: any, fileIndex: number) => (
            <div key={fileIndex} className="match-file">
              <div className="match-file-header">
                <span className="material-symbols">description</span>
                <span className="match-file-path">{file.path}</span>
                <span className="match-count">({file.matchCount})</span>
              </div>
              {file.matches && file.matches.slice(0, 3).map((match: any, matchIndex: number) => (
                <div key={matchIndex} className="match-line">
                  <span className="line-number">{match.lineNumber}</span>
                  <span className="line-content">
                    {match.lineContent?.length > 80 
                      ? match.lineContent.substring(0, 80) + '...' 
                      : match.lineContent}
                  </span>
                </div>
              ))}
              {file.matches && file.matches.length > 3 && (
                <div className="match-more">+{file.matches.length - 3} 更多匹配...</div>
              )}
            </div>
          ))}
          {data.results.length > 5 && (
            <div className="matches-more">...还有 {data.results.length - 5} 个文件</div>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * 编辑文件结果渲染
 */
const EditFileResult: React.FC<{ data: any }> = ({ data }) => {
  if (!data) {
    return <div className="tool-result-empty">编辑操作未返回结果</div>;
  }

  const isSuccess = data.applied;

  return (
    <div className={`tool-result-edit-file ${isSuccess ? 'success' : 'no-change'}`}>
      <div className="tool-result-header">
        <span className="material-symbols">{isSuccess ? 'edit_document' : 'edit_off'}</span>
        <span className="tool-result-filename">{data.file}</span>
        <span className={`tool-result-status ${isSuccess ? 'success' : ''}`}>
          {isSuccess ? '已修改' : '未修改'}
        </span>
      </div>

      {data.instructions && (
        <div className="tool-result-instructions">
          <span className="material-symbols">info</span>
          {data.instructions}
        </div>
      )}

      {isSuccess && data.diff && (
        <div className="tool-result-diff-stats">
          <span className={`diff-stat ${data.diff.added >= 0 ? 'added' : 'removed'}`}>
            <span className="material-symbols">{data.diff.added >= 0 ? 'add' : 'remove'}</span>
            {Math.abs(data.diff.added)} 字符
          </span>
          {data.diff.linesChanged > 0 && (
            <span className="diff-stat changed">
              <span className="material-symbols">swap_vert</span>
              {data.diff.linesChanged} 行变化
            </span>
          )}
          {data.changesApplied && (
            <span className="diff-stat edits">
              <span className="material-symbols">edit</span>
              {data.changesApplied} 处编辑
            </span>
          )}
        </div>
      )}

      {data.message && (
        <div className="tool-result-message">{data.message}</div>
      )}
    </div>
  );
};

/**
 * 删除文件结果渲染
 */
const DeleteFileResult: React.FC<{ data: any }> = ({ data }) => {
  if (!data) {
    return <div className="tool-result-empty">删除操作未返回结果</div>;
  }

  return (
    <div className={`tool-result-delete-file ${data.success ? 'success' : 'error'}`}>
      <div className="tool-result-header">
        <span className="material-symbols">{data.success ? 'delete_sweep' : 'error'}</span>
        <span className="tool-result-filename">{data.file || data.target_file}</span>
        <span className={`tool-result-status ${data.success ? 'success' : 'error'}`}>
          {data.success ? '已删除' : '删除失败'}
        </span>
      </div>
      {data.message && (
        <div className="tool-result-message">{data.message}</div>
      )}
    </div>
  );
};

/**
 * 网络搜索结果渲染
 */
const WebSearchResult: React.FC<{ data: any }> = ({ data }) => {
  if (!data) {
    return <div className="tool-result-empty">网络搜索未返回结果</div>;
  }

  return (
    <div className="tool-result-web-search">
      <div className="tool-result-header">
        <span className="material-symbols">travel_explore</span>
        <span className="tool-result-query">"{data.query}"</span>
        {data.results && (
          <span className="tool-result-count">{data.results.length} 条结果</span>
        )}
      </div>

      {data.results && data.results.length > 0 ? (
        <div className="tool-result-web-items">
          {data.results.slice(0, 4).map((item: any, index: number) => (
            <div key={index} className="web-result-item">
              <div className="web-result-title">{item.title}</div>
              {item.snippet && (
                <div className="web-result-snippet">
                  {item.snippet.length > 120 
                    ? item.snippet.substring(0, 120) + '...' 
                    : item.snippet}
                </div>
              )}
            </div>
          ))}
          {data.results.length > 4 && (
            <div className="web-results-more">...还有 {data.results.length - 4} 条结果</div>
          )}
        </div>
      ) : (
        <div className="tool-result-no-match">
          <span className="material-symbols">search_off</span>
          未找到相关结果
        </div>
      )}
    </div>
  );
};

/**
 * 差异历史结果渲染
 */
const DiffHistoryResult: React.FC<{ data: any }> = ({ data }) => {
  if (!data) {
    return <div className="tool-result-empty">差异历史未返回结果</div>;
  }

  return (
    <div className="tool-result-diff-history">
      <div className="tool-result-header">
        <span className="material-symbols">history</span>
        <span>差异历史</span>
      </div>
      {data.message && (
        <div className="tool-result-message">{data.message}</div>
      )}
    </div>
  );
};

/**
 * LaTeX 代码库搜索结果渲染
 */
const LatexCodeBaseSearchResult: React.FC<{ data: any }> = ({ data }) => {
  if (!data) {
    return <div className="tool-result-empty">代码库搜索未返回结果</div>;
  }

  return (
    <div className="tool-result-latex-search">
      <div className="tool-result-header">
        <span className="material-symbols">code</span>
        <span className="tool-result-query">"{data.query}"</span>
        {data.total_results !== undefined && (
          <span className="tool-result-count">{data.total_results} 条结果</span>
        )}
      </div>

      {data.results && data.results.length > 0 ? (
        <div className="tool-result-matches">
          {data.results.slice(0, 5).map((result: any, index: number) => (
            <div key={index} className="match-file">
              <div className="match-file-header">
                <span className="material-symbols">description</span>
                <span className="match-file-path">{result.file || result.path}</span>
              </div>
              {result.content && (
                <div className="match-content">
                  {result.content.length > 150 
                    ? result.content.substring(0, 150) + '...' 
                    : result.content}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="tool-result-no-match">
          <span className="material-symbols">search_off</span>
          未找到相关代码
        </div>
      )}
    </div>
  );
};

/**
 * 通用/默认结果渲染
 */
const DefaultResult: React.FC<{ data: any; toolName: string }> = ({ data, toolName }) => {
  // 如果有 message 字段，优先显示
  if (data?.message) {
    return (
      <div className="tool-result-default">
        <div className="tool-result-header">
          <span className="material-symbols">check_circle</span>
          <span>{toolName}</span>
        </div>
        <div className="tool-result-message">{data.message}</div>
      </div>
    );
  }

  // 否则显示简化的 JSON
  const displayData = data ? JSON.stringify(data, null, 2) : '执行完成';
  const truncated = displayData.length > 500 
    ? displayData.substring(0, 500) + '\n...(已截断)'
    : displayData;

  return (
    <div className="tool-result-default">
      <div className="tool-result-header">
        <span className="material-symbols">terminal</span>
        <span>{toolName}</span>
      </div>
      <pre className="tool-result-raw">{truncated}</pre>
    </div>
  );
};

/**
 * 错误结果渲染
 */
const ErrorResult: React.FC<{ error: string }> = ({ error }) => {
  return (
    <div className="tool-result-error">
      <div className="tool-result-header">
        <span className="material-symbols">error</span>
        <span>执行出错</span>
      </div>
      <div className="tool-result-error-message">{error}</div>
    </div>
  );
};

/**
 * 主渲染组件
 */
export const ToolResultRenderer: React.FC<ToolResultRendererProps> = ({ toolName, result }) => {
  const data = tryParseJSON(result);
  
  // 如果解析失败且有原始内容，检查是否是错误信息
  if (!data && result) {
    // 检查是否看起来像错误
    if (result.toLowerCase().includes('error') || result.startsWith('{') === false) {
      return <ErrorResult error={result} />;
    }
  }

  // 根据工具名称选择对应的渲染器
  const normalizedName = toolName?.toLowerCase().replace(/[_-]/g, '') || '';
  
  switch (normalizedName) {
    case 'listdir':
    case 'list dir':
      return <ListDirResult data={data} />;
      
    case 'readfile':
    case 'read file':
      return <ReadFileResult data={data} />;
      
    case 'grepsearch':
    case 'grep search':
    case 'grep':
      return <GrepSearchResult data={data} />;
      
    case 'editfile':
    case 'edit file':
      return <EditFileResult data={data} />;
      
    case 'deletefile':
    case 'delete file':
      return <DeleteFileResult data={data} />;
      
    case 'websearch':
    case 'web search':
      return <WebSearchResult data={data} />;
      
    case 'diffhistory':
    case 'diff history':
      return <DiffHistoryResult data={data} />;
      
    case 'latexcodebasesearch':
    case 'latex codebase search':
    case 'codebasesearch':
      return <LatexCodeBaseSearchResult data={data} />;
      
    case 'reapply':
      return <DefaultResult data={data} toolName="重新应用" />;
      
    default:
      return <DefaultResult data={data} toolName={toolName || '工具'} />;
  }
};

export default ToolResultRenderer;

