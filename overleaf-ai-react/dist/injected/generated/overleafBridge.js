/**
 * ⚠️  此文件由构建脚本自动生成，请勿直接修改
 * 
 * 源文件位置: public/injected/modules/
 * 入口文件: main.js
 * 
 * 构建时间: 2026-01-19T12:00:12.891Z
 * 构建脚本: scripts/build-bridge-new.js
 * 构建工具: esbuild
 */

(() => {
  // public/injected/modules/core/editorView.js
  function getEditorView() {
    try {
      const overleaf = window.overleaf;
      if (!overleaf || !overleaf.unstable || !overleaf.unstable.store) {
        return null;
      }
      return overleaf.unstable.store.get("editor.view");
    } catch (error) {
      console.error("[OverleafBridge] Failed to get EditorView:", error);
      return null;
    }
  }

  // public/injected/modules/methodHandlers/document.js
  function createDocumentHandlers(getEditorView2) {
    return {
      // 获取文档行数
      getDocLines: function() {
        const view = getEditorView2();
        if (!view) {
          throw new Error("EditorView not available");
        }
        return view.state.doc.lines;
      },
      // 获取文档完整文本
      getDocText: function() {
        const view = getEditorView2();
        if (!view) {
          throw new Error("EditorView not available");
        }
        return view.state.doc.toString();
      },
      // 获取选中的文本
      getSelection: function() {
        const view = getEditorView2();
        if (!view) {
          throw new Error("EditorView not available");
        }
        const selection = view.state.selection.main;
        return view.state.doc.sliceString(selection.from, selection.to);
      },
      // 获取选区详细信息（包含位置和文本）
      getSelectionInfo: function() {
        const view = getEditorView2();
        if (!view) {
          throw new Error("EditorView not available");
        }
        const selection = view.state.selection.main;
        const from = selection.from;
        const to = selection.to;
        const text = view.state.doc.sliceString(from, to);
        return {
          from,
          to,
          text,
          isEmpty: selection.empty
        };
      },
      // 获取光标位置
      getCursorPosition: function() {
        const view = getEditorView2();
        if (!view) {
          throw new Error("EditorView not available");
        }
        const pos = view.state.selection.main.head;
        const line = view.state.doc.lineAt(pos);
        return {
          line: line.number,
          column: pos - line.from,
          offset: pos
        };
      },
      // 根据 offset 获取位置信息（line/column/offset）
      getPositionAtOffset: function(offset) {
        const view = getEditorView2();
        if (!view) {
          throw new Error("EditorView not available");
        }
        const doc = view.state.doc;
        if (offset < 0 || offset > doc.length) {
          throw new Error("Offset " + offset + " out of range (0-" + doc.length + ")");
        }
        const line = doc.lineAt(offset);
        return {
          line: line.number,
          column: offset - line.from,
          offset
        };
      },
      // 获取指定行的范围信息（from/to 以及文本内容）
      getLineRange: function(lineNumber) {
        const view = getEditorView2();
        if (!view) {
          throw new Error("EditorView not available");
        }
        const doc = view.state.doc;
        if (lineNumber < 1 || lineNumber > doc.lines) {
          throw new Error("Line number " + lineNumber + " out of range (1-" + doc.lines + ")");
        }
        const line = doc.line(lineNumber);
        return {
          lineNumber: line.number,
          from: line.from,
          to: line.to,
          text: line.text
        };
      },
      // 获取指定行的内容
      getLineContent: function(lineNumber) {
        const view = getEditorView2();
        if (!view) {
          throw new Error("EditorView not available");
        }
        if (lineNumber < 1 || lineNumber > view.state.doc.lines) {
          throw new Error("Line number " + lineNumber + " out of range (1-" + view.state.doc.lines + ")");
        }
        return view.state.doc.line(lineNumber).text;
      },
      // 检查 EditorView 是否可用
      isEditorAvailable: function() {
        return getEditorView2() !== null;
      },
      // 读取指定行范围的内容（1-indexed，包含首尾）
      readLines: function(startLine, endLine) {
        const view = getEditorView2();
        if (!view) {
          throw new Error("EditorView not available");
        }
        const totalLines = view.state.doc.lines;
        if (startLine < 1) startLine = 1;
        if (endLine > totalLines) endLine = totalLines;
        if (startLine > endLine) {
          throw new Error("Invalid line range: start (" + startLine + ") > end (" + endLine + ")");
        }
        var lines = [];
        for (var i = startLine; i <= endLine; i++) {
          var line = view.state.doc.line(i);
          lines.push({
            lineNumber: i,
            text: line.text
          });
        }
        return {
          lines,
          totalLines,
          startLine,
          endLine,
          hasMoreBefore: startLine > 1,
          hasMoreAfter: endLine < totalLines
        };
      },
      // 读取整个文件内容（带行号）
      readEntireFile: function() {
        const view = getEditorView2();
        if (!view) {
          throw new Error("EditorView not available");
        }
        const totalLines = view.state.doc.lines;
        var lines = [];
        for (var i = 1; i <= totalLines; i++) {
          var line = view.state.doc.line(i);
          lines.push({
            lineNumber: i,
            text: line.text
          });
        }
        return {
          lines,
          totalLines,
          content: view.state.doc.toString()
        };
      }
    };
  }

  // public/injected/modules/methodHandlers/editor.js
  function createEditorHandlers(getEditorView2) {
    return {
      // 在光标位置插入文本（通过 EditorView API）
      insertText: function(text) {
        const view = getEditorView2();
        if (!view) {
          throw new Error("EditorView not available");
        }
        const selection = view.state.selection.main;
        view.dispatch({
          changes: { from: selection.from, to: selection.to, insert: text },
          selection: { anchor: selection.from + text.length }
        });
        return true;
      },
      // 替换指定范围的文本
      replaceRange: function(from, to, text) {
        const view = getEditorView2();
        if (!view) {
          throw new Error("EditorView not available");
        }
        view.dispatch({
          changes: { from, to, insert: text }
        });
        return true;
      },
      // 根据指定内容查找首个匹配并替换，返回匹配区间
      replaceFirstMatch: function(searchText, replaceText) {
        const view = getEditorView2();
        if (!view) {
          throw new Error("EditorView not available");
        }
        if (!searchText) {
          throw new Error("searchText must not be empty");
        }
        const doc = view.state.doc;
        const fullText = doc.toString();
        const firstIndex = fullText.indexOf(searchText);
        if (firstIndex === -1) {
          return {
            found: false,
            from: -1,
            to: -1,
            searchText,
            replaceText,
            matchesCount: 0
          };
        }
        let count = 1;
        let searchFrom = firstIndex + searchText.length;
        while (true) {
          const nextIndex = fullText.indexOf(searchText, searchFrom);
          if (nextIndex === -1) {
            break;
          }
          count++;
          searchFrom = nextIndex + searchText.length;
        }
        if (count > 1) {
          return {
            found: false,
            from: -1,
            to: -1,
            searchText,
            replaceText,
            matchesCount: count
          };
        }
        const from = firstIndex;
        const to = firstIndex + searchText.length;
        console.log("[OverleafBridge] replaceFirstMatch called:", {
          searchTextLength: searchText.length,
          replaceTextLength: replaceText ? replaceText.length : 0,
          from,
          to,
          matchesCount: count
        });
        view.dispatch({
          changes: { from, to, insert: replaceText }
        });
        return {
          found: true,
          from,
          to,
          searchText,
          replaceText,
          matchesCount: count
        };
      },
      // 设置整个文档内容（全量替换）
      setDocContent: function(newContent) {
        const view = getEditorView2();
        if (!view) {
          throw new Error("EditorView not available");
        }
        const doc = view.state.doc;
        const oldLength = doc.length;
        console.log("[OverleafBridge] setDocContent called:", {
          oldLength,
          newLength: newContent.length
        });
        view.dispatch({
          changes: { from: 0, to: oldLength, insert: newContent }
        });
        return {
          success: true,
          oldLength,
          newLength: newContent.length
        };
      },
      // 应用多个编辑操作（按 offset 倒序应用，避免位置偏移问题）
      applyEdits: function(edits) {
        const view = getEditorView2();
        if (!view) {
          throw new Error("EditorView not available");
        }
        if (!edits || edits.length === 0) {
          return { success: true, appliedCount: 0 };
        }
        console.log("[OverleafBridge] applyEdits called:", {
          editCount: edits.length
        });
        var sortedEdits = edits.slice().sort(function(a, b) {
          return b.from - a.from;
        });
        var changes = sortedEdits.map(function(edit) {
          return {
            from: edit.from,
            to: edit.to,
            insert: edit.insert || ""
          };
        });
        view.dispatch({ changes });
        return {
          success: true,
          appliedCount: edits.length
        };
      }
    };
  }

  // public/injected/modules/methodHandlers/file.js
  function createFileHandlers(getEditorView2, methodHandlers3) {
    return {
      // 获取文件信息（行数等元数据）
      getFileInfo: function() {
        const view = getEditorView2();
        if (!view) {
          throw new Error("EditorView not available");
        }
        const doc = view.state.doc;
        let fileInfo = null;
        try {
          fileInfo = methodHandlers3.getCurrentFile();
        } catch (e) {
          console.warn("[getFileInfo] Failed to get current file info:", e);
        }
        return {
          totalLines: doc.lines,
          totalLength: doc.length,
          fileName: fileInfo ? fileInfo.name : null,
          fileId: fileInfo ? fileInfo.id : null,
          fileType: fileInfo ? fileInfo.type : null
        };
      },
      // 获取当前打开的文件信息（支持文档和图片，无需 EditorView）
      getCurrentFile: function() {
        try {
          const selectedItem = document.querySelector('li[role="treeitem"][aria-selected="true"]');
          if (selectedItem) {
            const fileName = selectedItem.getAttribute("aria-label");
            const entityDiv = selectedItem.querySelector(".entity");
            const fileType = entityDiv ? entityDiv.getAttribute("data-file-type") : null;
            const fileId = entityDiv ? entityDiv.getAttribute("data-file-id") : null;
            if (fileName) {
              console.log(`[OverleafBridge] Found file via file tree: ${fileName} (${fileType}, ${fileId})`);
              return {
                name: fileName,
                id: fileId,
                type: fileType,
                source: "file_tree"
              };
            }
          }
        } catch (e) {
          console.warn("[OverleafBridge] File tree check failed:", e);
        }
        try {
          const store = window.overleaf?.unstable?.store;
          if (store) {
            const docName = store.get("editor.open_doc_name");
            const docId = store.get("editor.open_doc_id");
            if (docName) {
              console.log(`[OverleafBridge] Found file via store: ${docName} (${docId})`);
              return {
                name: docName,
                id: docId,
                type: "doc",
                // Store 里存的一般是 doc
                source: "store"
              };
            }
          }
        } catch (e) {
          console.warn("[OverleafBridge] Store check failed:", e);
        }
        try {
          const breadcrumb = document.querySelector(".ol-cm-breadcrumbs div:last-child, .breadcrumbs div:last-child");
          if (breadcrumb && breadcrumb.textContent) {
            const fileName = breadcrumb.textContent.trim();
            console.log(`[OverleafBridge] Found file via breadcrumb: ${fileName}`);
            return {
              name: fileName,
              id: null,
              type: null,
              source: "breadcrumb"
            };
          }
        } catch (e) {
          console.warn("[OverleafBridge] Breadcrumb check failed:", e);
        }
        return null;
      },
      // 切换当前编辑的文件
      switchFile: function(targetFilename) {
        console.log(`[OverleafBridge] Attempting to switch to file: "${targetFilename}"`);
        const fileNode = document.querySelector(`li[role="treeitem"][aria-label="${targetFilename}"]`);
        if (fileNode) {
          console.log("[OverleafBridge] Found file node DOM, clicking...");
          const clickTarget = fileNode.querySelector(".entity") || fileNode;
          const eventOptions = { bubbles: true, cancelable: true, view: window };
          clickTarget.dispatchEvent(new MouseEvent("mousedown", eventOptions));
          clickTarget.dispatchEvent(new MouseEvent("mouseup", eventOptions));
          clickTarget.dispatchEvent(new MouseEvent("click", eventOptions));
          console.log(`[OverleafBridge] Switch command sent to "${targetFilename}"`);
          return { success: true };
        } else {
          console.warn(`[OverleafBridge] DOM node not found for file "${targetFilename}"`);
          return {
            success: false,
            error: "File not found in file tree (it might be in a collapsed folder)"
          };
        }
      }
    };
  }

  // public/injected/modules/methodHandlers/project.js
  function createProjectHandlers(searchInternal2, getProjectId2, getAllDocsWithContent2) {
    return {
      // 获取全局搜索
      searchProject: async function(pattern, options) {
        return await searchInternal2(pattern, options);
      },
      // 获取项目文件统计信息（行数、字符数）
      getProjectFileStats: async function() {
        try {
          const projectId = getProjectId2();
          const files = await getAllDocsWithContent2(projectId);
          return files.map((f) => ({
            path: f.path,
            lines: f.content ? f.content.split("\n").length : 0,
            chars: f.content ? f.content.length : 0
          }));
        } catch (e) {
          console.error("[OverleafBridge] getProjectFileStats failed:", e);
          return [];
        }
      }
    };
  }

  // public/injected/modules/methodHandlers/index.js
  function createMethodHandlers(dependencies) {
    const {
      getEditorView: getEditorView2,
      searchInternal: searchInternal2,
      getProjectId: getProjectId2,
      getAllDocsWithContent: getAllDocsWithContent2
    } = dependencies;
    const methodHandlers3 = {};
    Object.assign(methodHandlers3, createDocumentHandlers(getEditorView2));
    Object.assign(methodHandlers3, createEditorHandlers(getEditorView2));
    Object.assign(methodHandlers3, createFileHandlers(getEditorView2, methodHandlers3));
    Object.assign(methodHandlers3, createProjectHandlers(
      searchInternal2,
      getProjectId2,
      getAllDocsWithContent2
    ));
    return methodHandlers3;
  }

  // public/injected/modules/core/registry.js
  var methodHandlers = {};
  function registerMethods(handlers) {
    Object.assign(methodHandlers, handlers);
  }

  // public/injected/modules/search/projectId.js
  function getProjectId() {
    const match = window.location.pathname.match(/\/project\/([a-f0-9]+)/);
    if (match) {
      return match[1];
    }
    const metaTag = document.querySelector('meta[name="ol-project_id"]');
    if (metaTag) {
      return metaTag.getAttribute("content");
    }
    throw new Error("\u65E0\u6CD5\u83B7\u53D6\u9879\u76EE ID");
  }

  // public/injected/modules/search/fetchers.js
  async function fetchEntities(projectId) {
    try {
      const response = await fetch(`/project/${projectId}/entities`);
      if (!response.ok) {
        throw new Error(`\u83B7\u53D6 entities \u5931\u8D25: ${response.status}`);
      }
      const data = await response.json();
      return data.entities || [];
    } catch (error) {
      console.error("[OverleafBridge] \u83B7\u53D6 entities \u5931\u8D25:", error);
      return [];
    }
  }
  async function fetchFileHashes(projectId) {
    try {
      const response = await fetch(`/project/${projectId}/latest/history`);
      if (!response.ok) {
        throw new Error(`\u83B7\u53D6 history \u5931\u8D25: ${response.status}`);
      }
      const data = await response.json();
      const fileHashes = {};
      if (data.chunk && data.chunk.history && data.chunk.history.changes) {
        data.chunk.history.changes.forEach((change) => {
          if (change.operations) {
            change.operations.forEach((op) => {
              if (op.pathname && op.file && op.file.hash) {
                fileHashes[op.pathname] = op.file.hash;
              }
            });
          }
        });
      }
      if (data.chunk && data.chunk.history && data.chunk.history.snapshot && data.chunk.history.snapshot.files) {
        const snapshotFiles = data.chunk.history.snapshot.files;
        for (const [pathname, fileData] of Object.entries(snapshotFiles)) {
          if (fileData && fileData.hash) {
            fileHashes[pathname] = fileData.hash;
          }
        }
      }
      return fileHashes;
    } catch (error) {
      console.error("[OverleafBridge] \u83B7\u53D6 history \u5931\u8D25:", error);
      return {};
    }
  }
  async function fetchBlobContent(projectId, hash) {
    try {
      const response = await fetch(`/project/${projectId}/blob/${hash}`);
      if (!response.ok) {
        throw new Error(`\u83B7\u53D6 blob \u5931\u8D25: ${response.status}`);
      }
      return await response.text();
    } catch (error) {
      console.error(`[OverleafBridge] \u83B7\u53D6 blob \u5931\u8D25 (hash: ${hash}):`, error);
      return null;
    }
  }
  async function getAllDocsWithContent(projectId) {
    const files = [];
    console.log("[OverleafBridge] \u4F7F\u7528 entities + history API \u83B7\u53D6\u6587\u4EF6");
    const entities = await fetchEntities(projectId);
    console.log(`[OverleafBridge] \u627E\u5230 ${entities.length} \u4E2A\u5B9E\u4F53`);
    const fileHashes = await fetchFileHashes(projectId);
    console.log(`[OverleafBridge] \u627E\u5230 ${Object.keys(fileHashes).length} \u4E2A\u6587\u4EF6 hash`);
    const docs = entities.filter((e) => e.type === "doc");
    console.log(`[OverleafBridge] \u627E\u5230 ${docs.length} \u4E2A\u53EF\u7F16\u8F91\u6587\u6863`);
    let currentDocPath = null;
    let currentDocContent = null;
    try {
      const view = getEditorView();
      if (view) {
        currentDocContent = view.state.doc.toString();
        const store = window.overleaf?.unstable?.store;
        if (store) {
          currentDocPath = store.get("editor.open_doc_name");
        }
        if (currentDocPath && currentDocContent) {
          console.log(`[OverleafBridge] \u5F53\u524D\u7F16\u8F91\u5668\u6587\u6863: ${currentDocPath} (${currentDocContent.length} \u5B57\u7B26\uFF0C\u4F7F\u7528\u5B9E\u65F6\u5185\u5BB9)`);
        }
      }
    } catch (e) {
      console.warn("[OverleafBridge] \u65E0\u6CD5\u83B7\u53D6\u5F53\u524D\u7F16\u8F91\u5668\u5185\u5BB9:", e);
    }
    const batchSize = 5;
    for (let i = 0; i < docs.length; i += batchSize) {
      const batch = docs.slice(i, i + batchSize);
      const contents = await Promise.all(
        batch.map(async (doc) => {
          const pathname = doc.path.startsWith("/") ? doc.path.substring(1) : doc.path;
          if (currentDocPath && currentDocContent && pathname === currentDocPath) {
            console.log(`[OverleafBridge] ${pathname}: \u4F7F\u7528\u7F16\u8F91\u5668\u5B9E\u65F6\u5185\u5BB9`);
            return currentDocContent;
          }
          const hash = fileHashes[pathname];
          if (hash) {
            return await fetchBlobContent(projectId, hash);
          } else {
            console.warn(`[OverleafBridge] \u672A\u627E\u5230\u6587\u4EF6 hash: ${pathname}`);
            return null;
          }
        })
      );
      for (let j = 0; j < batch.length; j++) {
        if (contents[j] !== null) {
          const path = batch[j].path.startsWith("/") ? batch[j].path.substring(1) : batch[j].path;
          files.push({
            path,
            content: contents[j]
          });
        }
      }
    }
    console.log(`[OverleafBridge] \u6210\u529F\u52A0\u8F7D ${files.length} \u4E2A\u6587\u6863\u5185\u5BB9`);
    return files;
  }

  // public/injected/modules/search/searchEngine.js
  function createSearchRegex(pattern, options = {}) {
    const { caseSensitive = false, wholeWord = false, regexp = false } = options;
    let regexPattern;
    if (regexp) {
      regexPattern = pattern;
    } else {
      regexPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
    if (wholeWord) {
      regexPattern = `\\b${regexPattern}\\b`;
    }
    const flags = caseSensitive ? "g" : "gi";
    try {
      return new RegExp(regexPattern, flags);
    } catch (error) {
      throw new Error(`\u65E0\u6548\u7684\u6B63\u5219\u8868\u8FBE\u5F0F: ${error.message}`);
    }
  }
  function searchInFile(file, regex) {
    const lines = file.content.split("\n");
    const matches = [];
    lines.forEach((line, lineIndex) => {
      let match;
      regex.lastIndex = 0;
      const matchesInLine = [];
      while ((match = regex.exec(line)) !== null) {
        matchesInLine.push({
          lineNumber: lineIndex + 1,
          columnStart: match.index + 1,
          columnEnd: match.index + match[0].length + 1,
          matchedText: match[0],
          lineContent: line
        });
        if (match.index === regex.lastIndex) {
          regex.lastIndex++;
        }
      }
      matches.push(...matchesInLine);
    });
    return matches;
  }
  async function searchInternal(pattern, options = {}) {
    const startTime = Date.now();
    console.log(`[OverleafBridge] \u{1F50D} \u6B63\u5728\u641C\u7D22: "${pattern}"`);
    console.log("[OverleafBridge] \u641C\u7D22\u9009\u9879:", options);
    try {
      const projectId = getProjectId();
      console.log(`[OverleafBridge] \u{1F4C2} \u9879\u76EE ID: ${projectId}`);
      console.log("[OverleafBridge] \u{1F4E5} \u6B63\u5728\u83B7\u53D6\u9879\u76EE\u6587\u6863...");
      const files = await getAllDocsWithContent(projectId);
      console.log(`[OverleafBridge] \u2705 \u5DF2\u52A0\u8F7D ${files.length} \u4E2A\u6587\u6863`);
      if (files.length === 0) {
        console.warn("[OverleafBridge] \u26A0\uFE0F \u672A\u627E\u5230\u4EFB\u4F55\u6587\u6863\uFF0C\u641C\u7D22\u5C06\u8FD4\u56DE\u7A7A\u7ED3\u679C");
        return {
          results: [],
          totalMatches: 0,
          fileCount: 0,
          duration: ((Date.now() - startTime) / 1e3).toFixed(2),
          error: "\u672A\u627E\u5230\u4EFB\u4F55\u6587\u6863"
        };
      }
      const regex = createSearchRegex(pattern, options);
      console.log("[OverleafBridge] \u{1F50E} \u6B63\u5728\u641C\u7D22...");
      const results = [];
      let totalMatches = 0;
      for (const file of files) {
        const matches = searchInFile(file, regex);
        if (matches.length > 0) {
          results.push({
            path: file.path,
            matchCount: matches.length,
            matches
          });
          totalMatches += matches.length;
        }
      }
      const endTime = Date.now();
      const duration = ((endTime - startTime) / 1e3).toFixed(2);
      console.log(`[OverleafBridge] \u2728 \u641C\u7D22\u5B8C\u6210\uFF01\u7528\u65F6: ${duration}\u79D2, \u627E\u5230 ${totalMatches} \u4E2A\u5339\u914D\u9879`);
      return {
        results,
        totalMatches,
        fileCount: results.length,
        duration
      };
    } catch (error) {
      console.error("[OverleafBridge] \u274C \u641C\u7D22\u5931\u8D25:", error);
      throw error;
    }
  }

  // public/injected/modules/modelManagement/models.js
  var FALLBACK_MODELS = [
    { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "openai" }
  ];
  var TEXT_ACTION_MODEL_KEY = "ol-ai-text-action-model";
  var availableModels = [];
  function getAvailableModels() {
    return availableModels.length > 0 ? availableModels : FALLBACK_MODELS;
  }
  function getSelectedTextActionModel() {
    try {
      const models = getAvailableModels();
      return localStorage.getItem(TEXT_ACTION_MODEL_KEY) || models[0].id;
    } catch (e) {
      const models = getAvailableModels();
      return models[0].id;
    }
  }
  function setSelectedTextActionModel(modelId) {
    try {
      localStorage.setItem(TEXT_ACTION_MODEL_KEY, modelId);
      window.postMessage({
        type: "OVERLEAF_TEXT_ACTION_MODEL_CHANGED",
        data: { modelId }
      }, "*");
      console.log("[OverleafBridge] Text action model changed to:", modelId);
    } catch (e) {
      console.error("[OverleafBridge] Failed to save model selection:", e);
    }
  }
  function updateModelSelectorOptions() {
    const select = document.getElementById("ol-ai-model-select");
    if (!select) return;
    const currentModel = getSelectedTextActionModel();
    const models = getAvailableModels();
    select.innerHTML = "";
    models.forEach(function(model) {
      const option = document.createElement("option");
      option.value = model.id;
      option.textContent = model.name;
      if (model.id === currentModel) {
        option.selected = true;
      }
      select.appendChild(option);
    });
    if (!models.find(function(m) {
      return m.id === currentModel;
    })) {
      select.value = models[0]?.id || "";
    }
    console.log("[OverleafBridge] Model selector updated with", models.length, "models");
  }
  function requestModelList() {
    window.postMessage({
      type: "OVERLEAF_REQUEST_MODEL_LIST",
      data: {}
    }, "*");
    console.log("[OverleafBridge] Requesting model list from React app");
  }
  function initModelListeners() {
    window.addEventListener("message", function(event) {
      if (event.source !== window) return;
      var data = event.data;
      if (!data || data.type !== "OVERLEAF_UPDATE_MODEL_LIST") return;
      var models = data.data?.models;
      if (!Array.isArray(models)) {
        console.warn("[OverleafBridge] Invalid model list received");
        return;
      }
      availableModels = models.map(function(model) {
        return {
          id: model.id,
          name: model.name,
          provider: model.provider
        };
      });
      console.log("[OverleafBridge] Model list updated:", availableModels.length, "models");
      updateModelSelectorOptions();
    });
    setTimeout(requestModelList, 100);
  }
  function createModelSelector() {
    const container = document.createElement("div");
    container.id = "ol-ai-model-selector";
    container.style.display = "flex";
    container.style.alignItems = "center";
    container.style.gap = "6px";
    container.style.marginTop = "8px";
    container.style.paddingTop = "8px";
    container.style.borderTop = "1px solid rgba(255,255,255,0.1)";
    const label = document.createElement("span");
    label.textContent = "\u{1F916} \u6A21\u578B:";
    label.style.fontSize = "11px";
    label.style.color = "#9ca3af";
    label.style.flexShrink = "0";
    container.appendChild(label);
    const select = document.createElement("select");
    select.id = "ol-ai-model-select";
    select.style.flex = "1";
    select.style.padding = "4px 8px";
    select.style.fontSize = "11px";
    select.style.borderRadius = "4px";
    select.style.border = "1px solid rgba(255,255,255,0.2)";
    select.style.background = "rgba(15, 23, 42, 0.8)";
    select.style.color = "#e5e7eb";
    select.style.cursor = "pointer";
    select.style.outline = "none";
    select.style.minWidth = "120px";
    const currentModel = getSelectedTextActionModel();
    const models = getAvailableModels();
    models.forEach(function(model) {
      const option = document.createElement("option");
      option.value = model.id;
      option.textContent = model.name;
      if (model.id === currentModel) {
        option.selected = true;
      }
      select.appendChild(option);
    });
    select.onchange = function() {
      setSelectedTextActionModel(this.value);
    };
    select.onclick = function(e) {
      e.stopPropagation();
    };
    container.appendChild(select);
    return container;
  }

  // public/injected/modules/selectionTooltip/textActions.js
  function getSelectionContext(view, from, to, contextLines = 15) {
    try {
      const doc = view.state.doc;
      const startLine = doc.lineAt(from);
      const endLine = doc.lineAt(to);
      const contextStartLineNum = Math.max(1, startLine.number - contextLines);
      const contextEndLineNum = Math.min(doc.lines, endLine.number + contextLines);
      let contextBefore = "";
      if (contextStartLineNum < startLine.number) {
        const beforeStartPos = doc.line(contextStartLineNum).from;
        const beforeEndPos = startLine.from;
        contextBefore = doc.sliceString(beforeStartPos, beforeEndPos);
        contextBefore = contextBefore.replace(/\n$/, "");
      }
      let contextAfter = "";
      if (contextEndLineNum > endLine.number) {
        const afterStartPos = endLine.to + 1;
        const afterEndPos = doc.line(contextEndLineNum).to;
        if (afterStartPos <= afterEndPos) {
          contextAfter = doc.sliceString(afterStartPos, afterEndPos);
        }
      }
      return { contextBefore, contextAfter };
    } catch (e) {
      console.error("[OverleafBridge] Failed to get selection context:", e);
      return { contextBefore: "", contextAfter: "" };
    }
  }
  function handleCustomRequest() {
    if (!checkIsActivated()) {
      console.warn("[OverleafBridge] Not activated, showing activation hint");
      showActivationRequiredHint();
      return;
    }
    const inputEl = document.getElementById("ol-ai-custom-input");
    if (!inputEl) return;
    const customPrompt = inputEl.value.trim();
    if (!customPrompt) {
      inputEl.style.border = "1px solid rgba(245, 158, 11, 0.5)";
      inputEl.placeholder = "\u8BF7\u8F93\u5165\u60A8\u7684\u8981\u6C42...";
      setTimeout(function() {
        inputEl.style.border = "1px solid rgba(255,255,255,0.15)";
        inputEl.placeholder = "\u8F93\u5165\u8981\u6C42\uFF0C\u5982\uFF1A\u63D2\u5165\u79EF\u5206\u516C\u5F0F\u3001\u6DA6\u8272\u6587\u672C...";
      }, 1500);
      return;
    }
    let selectionData = getCurrentSelection();
    if (!selectionData) {
      try {
        const view = getEditorView();
        if (view) {
          const selection = view.state.selection.main;
          const cursorPos = selection.head;
          selectionData = {
            from: cursorPos,
            to: cursorPos,
            text: "",
            isEmpty: true
          };
        }
      } catch (e) {
        console.error("[OverleafBridge] Failed to get cursor position:", e);
      }
    }
    if (!selectionData) {
      console.warn("[OverleafBridge] No cursor position available");
      return;
    }
    const selectedModel = getSelectedTextActionModel();
    const hasSelection = selectionData.text && selectionData.text.trim().length > 0;
    console.log("[OverleafBridge] Custom request:", customPrompt, "model:", selectedModel);
    let contextBefore = "";
    let contextAfter = "";
    try {
      const view = getEditorView();
      if (view) {
        const context = getSelectionContext(view, selectionData.from, selectionData.to);
        contextBefore = context.contextBefore;
        contextAfter = context.contextAfter;
      }
    } catch (e) {
      console.error("[OverleafBridge] Failed to get context:", e);
    }
    window.postMessage({
      type: "OVERLEAF_TEXT_ACTION_REQUEST",
      data: {
        action: "custom",
        customPrompt,
        text: selectionData.text || "",
        from: selectionData.from,
        to: selectionData.to,
        modelId: selectedModel,
        insertMode: !hasSelection,
        contextBefore,
        contextAfter
      }
    }, "*");
    inputEl.value = "";
    inputEl.style.height = "auto";
    hideSelectionTooltip();
  }
  function handleTextActionRequest(actionType) {
    if (!checkIsActivated()) {
      console.warn("[OverleafBridge] Not activated, showing activation hint");
      showActivationRequiredHint();
      return;
    }
    const currentSelection2 = getCurrentSelection();
    if (!currentSelection2) {
      console.warn("[OverleafBridge] No selection for text action");
      showNoSelectionHint();
      return;
    }
    if (currentSelection2.isEmpty || !currentSelection2.text || currentSelection2.text.trim().length === 0) {
      console.warn("[OverleafBridge] Empty selection for text action");
      showNoSelectionHint();
      return;
    }
    const selectedModel = getSelectedTextActionModel();
    console.log("[OverleafBridge] Text action requested:", actionType, "model:", selectedModel);
    let contextBefore = "";
    let contextAfter = "";
    const view = getEditorView();
    if (view) {
      const context = getSelectionContext(view, currentSelection2.from, currentSelection2.to);
      contextBefore = context.contextBefore;
      contextAfter = context.contextAfter;
    }
    window.postMessage({
      type: "OVERLEAF_TEXT_ACTION_REQUEST",
      data: {
        action: actionType,
        text: currentSelection2.text,
        from: currentSelection2.from,
        to: currentSelection2.to,
        modelId: selectedModel,
        contextBefore,
        contextAfter
      }
    }, "*");
    hideSelectionTooltip();
  }
  function initActionListeners() {
    window.addEventListener("message", function(event) {
      if (event.source !== window) return;
      var data = event.data;
      if (!data || data.type !== "OVERLEAF_TRANSLATE_RESPONSE" && data.type !== "OVERLEAF_TEXT_ACTION_RESPONSE") return;
      const actionType = data.data.action || "translate";
      console.log("[OverleafBridge] Received text action result:", actionType);
      try {
        const view = getEditorView();
        if (!view) return;
        const resultText = data.data.resultText || data.data.translatedText;
        if (!resultText) return;
        view.dispatch({
          changes: {
            from: data.data.from,
            to: data.data.to,
            insert: resultText
          }
        });
        console.log("[OverleafBridge] Text action applied successfully");
      } catch (error) {
        console.error("[OverleafBridge] Failed to apply text action:", error);
      }
    });
    window.addEventListener("keydown", function(event) {
      const isSlashKey = event.key === "/" || event.code === "Slash" || event.keyCode === 191;
      if (event.ctrlKey && event.altKey && isSlashKey) {
        event.preventDefault();
        event.stopPropagation();
        console.log("[OverleafBridge] Shortcut Ctrl+Alt+/ detected");
        const tooltip = document.getElementById("ol-ai-selection-tooltip");
        if (tooltip && tooltip.style.display === "flex") {
          hideSelectionTooltip();
        } else {
          showTextActionMenuAtCursor();
        }
        return false;
      }
    }, true);
  }

  // public/injected/modules/selectionTooltip/ui.js
  var SELECTION_ACTION_BUTTONS = [
    { id: "expand", label: "\u6269\u5199", icon: "", bgColor: "rgba(255,255,255,0.1)", hoverColor: "rgba(255,255,255,0.2)" },
    { id: "condense", label: "\u7F29\u5199", icon: "", bgColor: "rgba(255,255,255,0.1)", hoverColor: "rgba(255,255,255,0.2)" },
    { id: "polish", label: "\u6DA6\u8272", icon: "", bgColor: "rgba(255,255,255,0.1)", hoverColor: "rgba(255,255,255,0.2)" },
    { id: "translate", label: "\u8BD1", icon: "", bgColor: "rgba(255,255,255,0.1)", hoverColor: "rgba(255,255,255,0.2)" }
  ];
  var selectionTooltipEl = null;
  var buttonContainerEl = null;
  var currentSelection = null;
  var scrollThrottleTimer = null;
  function getCurrentSelection() {
    return currentSelection;
  }
  function hideSelectionTooltip() {
    if (selectionTooltipEl) {
      selectionTooltipEl.style.display = "none";
    }
    currentSelection = null;
  }
  function calculateTooltipPosition(coords) {
    const tooltipWidth = 280;
    const tooltipHeight = 50;
    let left = coords.left;
    let top = coords.bottom + 8;
    if (left + tooltipWidth > window.innerWidth - 20) {
      left = window.innerWidth - tooltipWidth - 20;
    }
    if (left < 10) {
      left = 10;
    }
    if (top + tooltipHeight > window.innerHeight - 20) {
      top = coords.top - tooltipHeight - 8;
    }
    if (top < 10) {
      top = 10;
    }
    return { left, top };
  }
  function createActionButton(config) {
    const btn = document.createElement("button");
    btn.textContent = config.icon + " " + config.label;
    btn.dataset.actionId = config.id;
    btn.style.background = config.bgColor;
    btn.style.color = "white";
    btn.style.border = "none";
    btn.style.padding = "6px 14px";
    btn.style.borderRadius = "4px";
    btn.style.cursor = "pointer";
    btn.style.fontSize = "12px";
    btn.style.fontWeight = "500";
    btn.style.transition = "all 0.2s ease";
    btn.style.boxShadow = "0 1px 3px rgba(0,0,0,0.2)";
    const bgColor = config.bgColor;
    const hoverColor = config.hoverColor;
    btn.onmouseenter = function() {
      this.style.background = hoverColor;
      this.style.transform = "translateY(-1px)";
      this.style.boxShadow = "0 2px 6px rgba(0,0,0,0.3)";
    };
    btn.onmouseleave = function() {
      this.style.background = bgColor;
      this.style.transform = "translateY(0)";
      this.style.boxShadow = "0 1px 3px rgba(0,0,0,0.2)";
    };
    btn.onclick = function(e) {
      e.stopPropagation();
      handleTextActionRequest(config.id);
    };
    return btn;
  }
  function createSelectionTooltip() {
    const tooltip = document.createElement("div");
    tooltip.id = "ol-ai-selection-tooltip";
    tooltip.style.position = "fixed";
    tooltip.style.zIndex = "9999";
    tooltip.style.background = "#1e1e1e";
    tooltip.style.color = "#e5e7eb";
    tooltip.style.padding = "8px";
    tooltip.style.borderRadius = "8px";
    tooltip.style.fontSize = "12px";
    tooltip.style.boxShadow = "0 4px 20px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255,255,255,0.1)";
    tooltip.style.display = "none";
    tooltip.style.flexDirection = "column";
    tooltip.style.gap = "8px";
    tooltip.style.backdropFilter = "blur(10px)";
    tooltip.style.transition = "left 0.1s ease-out, top 0.1s ease-out, opacity 0.15s ease";
    tooltip.style.opacity = "1";
    tooltip.style.minWidth = "320px";
    tooltip.style.maxWidth = "420px";
    const customInputContainer = document.createElement("div");
    customInputContainer.id = "ol-ai-custom-input-container";
    customInputContainer.style.display = "flex";
    customInputContainer.style.gap = "6px";
    customInputContainer.style.alignItems = "stretch";
    const customInput = document.createElement("textarea");
    customInput.id = "ol-ai-custom-input";
    customInput.placeholder = "\u8F93\u5165\u60A8\u7684\u8981\u6C42...";
    customInput.style.flex = "1";
    customInput.style.padding = "6px 10px";
    customInput.style.fontSize = "12px";
    customInput.style.borderRadius = "6px";
    customInput.style.border = "1px solid #333";
    customInput.style.background = "#2d2d2d";
    customInput.style.color = "#e5e7eb";
    customInput.style.outline = "none";
    customInput.style.resize = "none";
    customInput.style.height = "32px";
    customInput.style.minHeight = "32px";
    customInput.style.maxHeight = "60px";
    customInput.style.lineHeight = "1.4";
    customInput.style.fontFamily = "inherit";
    customInput.onfocus = function() {
      this.style.border = "1px solid #5865f2";
      this.style.background = "#363636";
    };
    customInput.onblur = function() {
      this.style.border = "1px solid #333";
      this.style.background = "#2d2d2d";
    };
    customInput.onkeydown = function(e) {
      e.stopPropagation();
      if (e.ctrlKey && e.key === "Enter" || e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleCustomRequest();
      }
      if (e.key === "Escape") {
        hideSelectionTooltip();
      }
    };
    customInput.oninput = function() {
      this.style.height = "32px";
      this.style.height = Math.min(this.scrollHeight, 60) + "px";
    };
    customInputContainer.appendChild(customInput);
    const sendBtn = document.createElement("button");
    sendBtn.id = "ol-ai-send-btn";
    sendBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>';
    sendBtn.title = "\u53D1\u9001 (Enter)";
    sendBtn.style.width = "32px";
    sendBtn.style.height = "32px";
    sendBtn.style.padding = "0";
    sendBtn.style.borderRadius = "6px";
    sendBtn.style.border = "none";
    sendBtn.style.background = "#5865f2";
    sendBtn.style.color = "white";
    sendBtn.style.cursor = "pointer";
    sendBtn.style.transition = "all 0.2s ease";
    sendBtn.style.display = "flex";
    sendBtn.style.alignItems = "center";
    sendBtn.style.justifyContent = "center";
    sendBtn.style.flexShrink = "0";
    sendBtn.onmouseenter = function() {
      this.style.background = "#4752c4";
    };
    sendBtn.onmouseleave = function() {
      this.style.background = "#5865f2";
    };
    sendBtn.onclick = function(e) {
      e.stopPropagation();
      handleCustomRequest();
    };
    customInputContainer.appendChild(sendBtn);
    tooltip.appendChild(customInputContainer);
    const bottomRow = document.createElement("div");
    bottomRow.style.display = "flex";
    bottomRow.style.gap = "6px";
    bottomRow.style.alignItems = "center";
    bottomRow.style.justifyContent = "space-between";
    buttonContainerEl = document.createElement("div");
    buttonContainerEl.id = "ol-ai-selection-buttons";
    buttonContainerEl.style.display = "flex";
    buttonContainerEl.style.gap = "4px";
    buttonContainerEl.style.flexWrap = "nowrap";
    buttonContainerEl.style.pointerEvents = "auto";
    SELECTION_ACTION_BUTTONS.forEach(function(btnConfig) {
      const btn = createActionButton(btnConfig);
      btn.style.padding = "4px 8px";
      btn.style.fontSize = "11px";
      btn.style.border = "1px solid rgba(255,255,255,0.1)";
      buttonContainerEl.appendChild(btn);
    });
    bottomRow.appendChild(buttonContainerEl);
    const modelSelector = createModelSelector();
    modelSelector.style.marginTop = "0";
    modelSelector.style.paddingTop = "0";
    modelSelector.style.borderTop = "none";
    modelSelector.style.flex = "1";
    modelSelector.style.justifyContent = "flex-end";
    const label = modelSelector.querySelector("span");
    if (label) label.style.display = "none";
    const select = modelSelector.querySelector("select");
    if (select) {
      select.style.width = "auto";
      select.style.minWidth = "80px";
      select.style.maxWidth = "100px";
      select.style.padding = "4px 2px";
      select.style.height = "24px";
      select.style.background = "#2d2d2d";
      select.style.border = "1px solid rgba(255,255,255,0.1)";
    }
    bottomRow.appendChild(modelSelector);
    tooltip.appendChild(bottomRow);
    document.body.appendChild(tooltip);
    return tooltip;
  }
  function showSelectionTooltipForCurrentSelection() {
    try {
      const view = getEditorView();
      if (!view) {
        hideSelectionTooltip();
        return;
      }
      const doc = view.state.doc;
      const selection = view.state.selection.main;
      if (!selection || selection.empty) {
        hideSelectionTooltip();
        return;
      }
      const from = selection.from;
      const to = selection.to;
      const text = doc.sliceString(from, to);
      if (!text || text.trim().length === 0) {
        hideSelectionTooltip();
        return;
      }
      const coords = view.coordsAtPos(to);
      if (!coords) {
        hideSelectionTooltip();
        return;
      }
      currentSelection = {
        from,
        to,
        text,
        isEmpty: false
      };
      if (!selectionTooltipEl) {
        selectionTooltipEl = createSelectionTooltip();
      }
      const pos = calculateTooltipPosition(coords);
      selectionTooltipEl.style.left = String(pos.left) + "px";
      selectionTooltipEl.style.top = String(pos.top) + "px";
      selectionTooltipEl.style.display = "flex";
      hideNoSelectionHint();
    } catch (e) {
      console.error("[OverleafBridge] Failed to show selection tooltip:", e);
    }
  }
  function showInsertOnlyMode() {
    if (!selectionTooltipEl) return;
    const buttonsContainer = selectionTooltipEl.querySelector("#ol-ai-selection-buttons");
    if (buttonsContainer) {
      buttonsContainer.style.display = "none";
    }
    const inputEl = document.getElementById("ol-ai-custom-input");
    if (inputEl) {
      inputEl.placeholder = "\u8F93\u5165\u8981\u751F\u6210\u7684\u5185\u5BB9...";
    }
    console.log("[OverleafBridge] Switched to insert-only mode");
  }
  function showFullMenuMode() {
    if (!selectionTooltipEl) return;
    const buttonsContainer = selectionTooltipEl.querySelector("#ol-ai-selection-buttons");
    if (buttonsContainer) {
      buttonsContainer.style.display = "flex";
    }
    const buttons = selectionTooltipEl.querySelectorAll("#ol-ai-selection-buttons button");
    buttons.forEach(function(btn) {
      btn.disabled = false;
      btn.style.opacity = "1";
      btn.style.cursor = "pointer";
    });
    const inputEl = document.getElementById("ol-ai-custom-input");
    if (inputEl) {
      inputEl.placeholder = "\u8F93\u5165\u60A8\u7684\u8981\u6C42...";
    }
    console.log("[OverleafBridge] Switched to full menu mode");
  }
  function showNoSelectionHint() {
    showInsertOnlyMode();
  }
  function hideNoSelectionHint() {
    showFullMenuMode();
  }
  function showTextActionMenuAtCursor() {
    try {
      const view = getEditorView();
      if (!view) {
        console.warn("[OverleafBridge] EditorView not available for shortcut menu");
        return;
      }
      const doc = view.state.doc;
      const selection = view.state.selection.main;
      const cursorPos = selection.head;
      const coords = view.coordsAtPos(cursorPos);
      if (!coords) {
        console.warn("[OverleafBridge] Cannot get cursor coordinates");
        return;
      }
      const hasSelection = !selection.empty;
      const from = selection.from;
      const to = selection.to;
      const text = hasSelection ? doc.sliceString(from, to) : "";
      currentSelection = {
        from,
        to,
        text,
        isEmpty: !hasSelection
      };
      if (!selectionTooltipEl) {
        selectionTooltipEl = createSelectionTooltip();
      }
      const pos = calculateTooltipPosition(coords);
      selectionTooltipEl.style.left = String(pos.left) + "px";
      selectionTooltipEl.style.top = String(pos.top) + "px";
      selectionTooltipEl.style.display = "flex";
      if (!hasSelection) {
        showInsertOnlyMode();
      } else {
        showFullMenuMode();
      }
      console.log("[OverleafBridge] Text action menu shown via shortcut (Ctrl+Alt+/)", {
        hasSelection,
        cursorPos,
        mode: hasSelection ? "full" : "insert-only"
      });
    } catch (e) {
      console.error("[OverleafBridge] Failed to show text action menu via shortcut:", e);
    }
  }
  function updateTooltipPosition() {
    if (!selectionTooltipEl || selectionTooltipEl.style.display === "none" || !currentSelection) {
      return;
    }
    try {
      const view = getEditorView();
      if (!view) {
        hideSelectionTooltip();
        return;
      }
      const selection = view.state.selection.main;
      if (!selection || selection.empty || selection.from !== currentSelection.from || selection.to !== currentSelection.to) {
        hideSelectionTooltip();
        return;
      }
      const coords = view.coordsAtPos(currentSelection.to);
      if (!coords) {
        hideSelectionTooltip();
        return;
      }
      if (coords.bottom < 0 || coords.top > window.innerHeight) {
        selectionTooltipEl.style.opacity = "0";
        selectionTooltipEl.style.pointerEvents = "none";
      } else {
        selectionTooltipEl.style.opacity = "1";
        selectionTooltipEl.style.pointerEvents = "auto";
        const pos = calculateTooltipPosition(coords);
        selectionTooltipEl.style.left = String(pos.left) + "px";
        selectionTooltipEl.style.top = String(pos.top) + "px";
      }
    } catch (e) {
      console.error("[OverleafBridge] Failed to update tooltip position:", e);
    }
  }
  function initUIListeners() {
    window.addEventListener("mouseup", function(event) {
      if (selectionTooltipEl && selectionTooltipEl.contains(event.target)) {
        return;
      }
      setTimeout(function() {
        showSelectionTooltipForCurrentSelection();
      }, 10);
    });
    function handleScroll() {
      if (scrollThrottleTimer) return;
      scrollThrottleTimer = setTimeout(function() {
        scrollThrottleTimer = null;
        updateTooltipPosition();
      }, 16);
    }
    setTimeout(() => {
      window.addEventListener("scroll", handleScroll, { passive: true });
      const editorContainer = document.querySelector(".cm-scroller");
      if (editorContainer) {
        editorContainer.addEventListener("scroll", handleScroll, { passive: true });
      }
      const otherContainers = document.querySelectorAll(".editor-container, .cm-editor");
      otherContainers.forEach(function(container) {
        container.addEventListener("scroll", handleScroll, { passive: true });
      });
    }, 1e3);
    document.addEventListener("mousedown", function(event) {
      if (selectionTooltipEl && !selectionTooltipEl.contains(event.target)) {
      }
    });
    window.addEventListener("keydown", function(event) {
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      if (event.key === "Shift" || event.key === "Control" || event.key === "Alt" || event.key === "Meta") return;
      if (event.key === "Escape") return;
      if (currentSelection) {
        hideSelectionTooltip();
      }
    });
  }

  // public/injected/modules/modelManagement/state.js
  var isActivated = false;
  function checkIsActivated() {
    return isActivated;
  }
  function showActivationRequiredHint() {
    hideSelectionTooltip();
    window.postMessage({
      type: "OVERLEAF_SHOW_ACTIVATION_MODAL",
      data: {}
    }, "*");
    console.log("[OverleafBridge] Requesting to show activation modal");
  }
  function requestActivationStatus() {
    window.postMessage({
      type: "OVERLEAF_REQUEST_ACTIVATION_STATUS",
      data: {}
    }, "*");
    console.log("[OverleafBridge] Requesting activation status from React app");
  }
  function initStateListeners() {
    window.addEventListener("message", function(event) {
      if (event.source !== window) return;
      var data = event.data;
      if (!data || data.type !== "OVERLEAF_ACTIVATION_STATUS_UPDATE") return;
      var newStatus = data.data?.isActivated;
      if (typeof newStatus === "boolean") {
        var oldStatus = isActivated;
        isActivated = newStatus;
        console.log("[OverleafBridge] Activation status updated:", isActivated, "(was:", oldStatus, ")");
      }
    });
    setTimeout(requestActivationStatus, 200);
  }

  // public/injected/modules/modelManagement/index.js
  function initModelManagement() {
    console.log("[OverleafBridge] Initializing Model Management...");
    initStateListeners();
    initModelListeners();
  }

  // public/injected/modules/selectionTooltip/index.js
  function initSelectionTooltip() {
    console.log("[OverleafBridge] Initializing Selection Tooltip...");
    initUIListeners();
    initActionListeners();
  }

  // public/injected/modules/core/utils.js
  function getCurrentFileName() {
    try {
      var fileTab = document.querySelector(".file-tree-inner .selected .name");
      if (fileTab) return fileTab.textContent;
      var breadcrumb = document.querySelector(".editor-header .name");
      if (breadcrumb) return breadcrumb.textContent;
      var store = window.overleaf && window.overleaf.unstable && window.overleaf.unstable.store;
      if (store) {
        var openDocId = store.get("editor.open_doc_id");
        var docs = store.get("docs");
        if (openDocId && docs) {
          for (var key in docs) {
            if (docs[key]._id === openDocId) {
              return docs[key].name || "unknown";
            }
          }
        }
      }
      return "unknown";
    } catch (e) {
      return "unknown";
    }
  }

  // public/injected/modules/diff/extension.js
  var diffEffects = {};
  var diffSuggestionField = null;
  function createDiffSuggestionWidgetClass(CM) {
    const WidgetType = CM.WidgetType;
    return class DiffSuggestionWidget extends WidgetType {
      constructor(config) {
        super();
        this.config = config;
      }
      toDOM(view) {
        const config = this.config;
        const id = config.id;
        const newContent = config.newContent;
        const onAccept = config.onAccept;
        const onReject = config.onReject;
        const container = document.createElement("div");
        container.className = "diff-suggestion-block";
        container.dataset.suggestionId = id;
        const newContentDiv = document.createElement("div");
        newContentDiv.className = "diff-new-content";
        const text = document.createElement("span");
        text.className = "diff-new-text";
        text.textContent = newContent;
        newContentDiv.appendChild(text);
        const buttons = document.createElement("div");
        buttons.className = "diff-buttons";
        const rejectBtn = document.createElement("button");
        rejectBtn.className = "diff-btn diff-btn-reject";
        rejectBtn.innerHTML = "\u2715 Reject";
        rejectBtn.type = "button";
        rejectBtn.addEventListener("mousedown", function(e) {
          e.preventDefault();
        });
        rejectBtn.addEventListener("click", function(e) {
          e.preventDefault();
          e.stopPropagation();
          if (onReject) onReject(view, id);
        });
        const acceptBtn = document.createElement("button");
        acceptBtn.className = "diff-btn diff-btn-accept";
        acceptBtn.innerHTML = "\u2713 Accept";
        acceptBtn.type = "button";
        acceptBtn.addEventListener("mousedown", function(e) {
          e.preventDefault();
        });
        acceptBtn.addEventListener("click", function(e) {
          e.preventDefault();
          e.stopPropagation();
          if (onAccept) onAccept(view, id);
        });
        buttons.appendChild(rejectBtn);
        buttons.appendChild(acceptBtn);
        newContentDiv.appendChild(buttons);
        container.appendChild(newContentDiv);
        return container;
      }
      eq(other) {
        return this.config.id === other.config.id && this.config.newContent === other.config.newContent;
      }
      ignoreEvent(event) {
        return event.type !== "mousedown" && event.type !== "mouseup";
      }
    };
  }
  function createSegmentSuggestionWidgetClass(CM) {
    const WidgetType = CM.WidgetType;
    return class SegmentSuggestionWidget extends WidgetType {
      constructor(config) {
        super();
        this.config = config;
      }
      toDOM(view) {
        const config = this.config;
        const id = config.id;
        const newContent = config.newContent;
        const onAccept = config.onAccept;
        const onReject = config.onReject;
        const container = document.createElement("span");
        container.className = "diff-segment-widget";
        container.dataset.suggestionId = id;
        const newText = document.createElement("span");
        newText.className = "diff-segment-new";
        newText.textContent = newContent;
        container.appendChild(newText);
        const buttons = document.createElement("span");
        buttons.className = "diff-segment-buttons";
        const acceptBtn = document.createElement("button");
        acceptBtn.className = "diff-segment-btn diff-segment-btn-accept";
        acceptBtn.innerHTML = "\u2713";
        acceptBtn.type = "button";
        acceptBtn.title = "Accept";
        acceptBtn.addEventListener("mousedown", function(e) {
          e.preventDefault();
        });
        acceptBtn.addEventListener("click", function(e) {
          e.preventDefault();
          e.stopPropagation();
          if (onAccept) onAccept(view, id);
        });
        const rejectBtn = document.createElement("button");
        rejectBtn.className = "diff-segment-btn diff-segment-btn-reject";
        rejectBtn.innerHTML = "\u2715";
        rejectBtn.type = "button";
        rejectBtn.title = "Reject";
        rejectBtn.addEventListener("mousedown", function(e) {
          e.preventDefault();
        });
        rejectBtn.addEventListener("click", function(e) {
          e.preventDefault();
          e.stopPropagation();
          if (onReject) onReject(view, id);
        });
        buttons.appendChild(acceptBtn);
        buttons.appendChild(rejectBtn);
        container.appendChild(buttons);
        return container;
      }
      eq(other) {
        return this.config.id === other.config.id && this.config.newContent === other.config.newContent;
      }
      ignoreEvent(event) {
        return event.type !== "mousedown" && event.type !== "mouseup";
      }
    };
  }
  function createInlineStatusWidgetClass(CM) {
    const WidgetType = CM.WidgetType;
    return class InlineStatusWidget extends WidgetType {
      constructor(config) {
        super();
        this.config = config;
      }
      toDOM(view) {
        const config = this.config;
        const spinner = document.createElement("span");
        spinner.className = "inline-generating-spinner";
        spinner.dataset.inlineStatusId = config.id;
        spinner.title = "\u751F\u6210\u4E2D... (\u6309 ESC \u53D6\u6D88)";
        return spinner;
      }
      eq(other) {
        return this.config.id === other.config.id && this.config.state === other.config.state;
      }
      ignoreEvent(event) {
        return true;
      }
    };
  }
  function createDiffSuggestionExtension(CM) {
    const StateEffect = CM.StateEffect;
    const StateField = CM.StateField;
    const EditorView = CM.EditorView;
    const Decoration = CM.Decoration;
    const DiffSuggestionWidget = createDiffSuggestionWidgetClass(CM);
    const SegmentSuggestionWidget = createSegmentSuggestionWidgetClass(CM);
    const InlineStatusWidget = createInlineStatusWidgetClass(CM);
    diffEffects.addDiffSuggestionEffect = StateEffect.define();
    diffEffects.removeDiffSuggestionEffect = StateEffect.define();
    diffEffects.clearDiffSuggestionsEffect = StateEffect.define();
    diffEffects.addSegmentSuggestionEffect = StateEffect.define();
    diffEffects.removeSegmentSuggestionEffect = StateEffect.define();
    diffEffects.clearSegmentSuggestionsEffect = StateEffect.define();
    diffEffects.addInlineStatusEffect = StateEffect.define();
    diffEffects.updateInlineStatusEffect = StateEffect.define();
    diffEffects.removeInlineStatusEffect = StateEffect.define();
    diffEffects.clearInlineStatusEffect = StateEffect.define();
    window._diffSuggestionEffects = diffEffects;
    diffSuggestionField = StateField.define({
      create: function() {
        return {
          suggestions: /* @__PURE__ */ new Map(),
          segments: /* @__PURE__ */ new Map(),
          inlineStatus: /* @__PURE__ */ new Map()
        };
      },
      update: function(value, tr) {
        const suggestions = new Map(value.suggestions);
        const segments = new Map(value.segments);
        const inlineStatus = new Map(value.inlineStatus);
        if (tr.docChanged) {
          for (const entry of suggestions) {
            const id = entry[0];
            const config = entry[1];
            suggestions.set(id, {
              ...config,
              lineFrom: tr.changes.mapPos(config.lineFrom, 1),
              lineTo: tr.changes.mapPos(config.lineTo, 1),
              widgetPos: tr.changes.mapPos(config.widgetPos, 1)
            });
          }
          for (const entry of segments) {
            const id = entry[0];
            const config = entry[1];
            segments.set(id, {
              ...config,
              startOffset: tr.changes.mapPos(config.startOffset, 1),
              endOffset: tr.changes.mapPos(config.endOffset, -1),
              widgetPos: tr.changes.mapPos(config.widgetPos, 1)
            });
          }
          for (const entry of inlineStatus) {
            const id = entry[0];
            const config = entry[1];
            inlineStatus.set(id, {
              ...config,
              from: tr.changes.mapPos(config.from, 1),
              to: tr.changes.mapPos(config.to, -1),
              widgetPos: tr.changes.mapPos(config.widgetPos, -1)
            });
          }
        }
        for (const effect of tr.effects) {
          if (effect.is(diffEffects.addDiffSuggestionEffect)) {
            suggestions.set(effect.value.id, effect.value);
          } else if (effect.is(diffEffects.removeDiffSuggestionEffect)) {
            suggestions.delete(effect.value);
          } else if (effect.is(diffEffects.clearDiffSuggestionsEffect)) {
            suggestions.clear();
          } else if (effect.is(diffEffects.addSegmentSuggestionEffect)) {
            segments.set(effect.value.id, effect.value);
          } else if (effect.is(diffEffects.removeSegmentSuggestionEffect)) {
            segments.delete(effect.value);
          } else if (effect.is(diffEffects.clearSegmentSuggestionsEffect)) {
            segments.clear();
          } else if (effect.is(diffEffects.addInlineStatusEffect)) {
            inlineStatus.set(effect.value.id, effect.value);
          } else if (effect.is(diffEffects.updateInlineStatusEffect)) {
            const existing = inlineStatus.get(effect.value.id);
            if (existing) {
              inlineStatus.set(effect.value.id, { ...existing, ...effect.value });
            }
          } else if (effect.is(diffEffects.removeInlineStatusEffect)) {
            inlineStatus.delete(effect.value);
          } else if (effect.is(diffEffects.clearInlineStatusEffect)) {
            inlineStatus.clear();
          }
        }
        return { suggestions, segments, inlineStatus };
      },
      provide: function(field) {
        return EditorView.decorations.compute([field], function(state) {
          const fieldValue = state.field(field);
          const suggestions = fieldValue.suggestions;
          const segments = fieldValue.segments;
          const inlineStatus = fieldValue.inlineStatus;
          const decorations = [];
          for (const entry of suggestions) {
            const id = entry[0];
            const config = entry[1];
            try {
              const lineStart = state.doc.lineAt(config.lineFrom);
              const lineEnd = state.doc.lineAt(config.lineTo);
              for (let i = lineStart.number; i <= lineEnd.number; i++) {
                const line = state.doc.line(i);
                decorations.push(
                  Decoration.line({ class: "diff-line-deleted" }).range(line.from)
                );
              }
              decorations.push(
                Decoration.widget({
                  widget: new DiffSuggestionWidget(config),
                  block: true,
                  side: 1
                }).range(config.widgetPos)
              );
            } catch (e) {
              console.error("[DiffAPI] \u521B\u5EFA\u884C\u7EA7\u88C5\u9970\u5931\u8D25:", e);
            }
          }
          for (const entry of segments) {
            const id = entry[0];
            const config = entry[1];
            try {
              if (config.startOffset < config.endOffset) {
                decorations.push(
                  Decoration.mark({ class: "diff-segment-deleted" }).range(config.startOffset, config.endOffset)
                );
              }
              decorations.push(
                Decoration.widget({
                  widget: new SegmentSuggestionWidget(config),
                  side: 1
                }).range(config.widgetPos)
              );
            } catch (e) {
              console.error("[DiffAPI] \u521B\u5EFA\u7247\u6BB5\u7EA7\u88C5\u9970\u5931\u8D25:", e);
            }
          }
          for (const entry of inlineStatus) {
            const id = entry[0];
            const config = entry[1];
            try {
              if (config.state === "generating") {
                if (config.from < config.to) {
                  decorations.push(
                    Decoration.mark({ class: "inline-generating-text" }).range(config.from, config.to)
                  );
                }
                const spinnerPos = config.to;
                decorations.push(
                  Decoration.widget({
                    widget: new InlineStatusWidget(config),
                    side: 1
                  }).range(spinnerPos)
                );
              }
            } catch (e) {
              console.error("[InlineStatus] \u521B\u5EFA\u5185\u8054\u72B6\u6001\u88C5\u9970\u5931\u8D25:", e);
            }
          }
          return Decoration.set(decorations, true);
        });
      }
    });
    window._diffSuggestionField = diffSuggestionField;
    return diffSuggestionField;
  }

  // public/injected/modules/diff/store.js
  var diffSuggestionsByFile = /* @__PURE__ */ new Map();
  var inlineStatusByFile = /* @__PURE__ */ new Map();
  var diffCurrentIndex = 0;
  var diffCurrentFileName = null;
  var diffCurrentView = null;
  var diffFileCheckInterval = null;
  function setDiffCurrentIndex(index) {
    diffCurrentIndex = index;
  }
  function setDiffCurrentFileName(fileName) {
    diffCurrentFileName = fileName;
  }
  function setDiffCurrentView(view) {
    diffCurrentView = view;
  }
  function setDiffFileCheckInterval(interval) {
    diffFileCheckInterval = interval;
  }
  window._inlineStatusByFile = inlineStatusByFile;
  function getCurrentFileInlineStatus(fileName) {
    const currentFile = fileName || diffCurrentFileName || getCurrentFileName();
    if (!currentFile || currentFile === "unknown") return /* @__PURE__ */ new Map();
    if (!inlineStatusByFile.has(currentFile)) {
      inlineStatusByFile.set(currentFile, /* @__PURE__ */ new Map());
    }
    return inlineStatusByFile.get(currentFile);
  }
  function getCurrentFileSuggestions(fileName) {
    const currentFile = fileName || diffCurrentFileName || getCurrentFileName();
    if (!currentFile || currentFile === "unknown") return /* @__PURE__ */ new Map();
    if (!diffSuggestionsByFile.has(currentFile)) {
      diffSuggestionsByFile.set(currentFile, /* @__PURE__ */ new Map());
    }
    return diffSuggestionsByFile.get(currentFile);
  }
  function getTotalSuggestionsCount() {
    let count = 0;
    for (const entry of diffSuggestionsByFile) {
      count += entry[1].size;
    }
    return count;
  }
  function getFilesWithSuggestions(currentFileName) {
    const current = currentFileName || diffCurrentFileName;
    const filesWithSuggestions = [];
    let totalChanges = 0;
    for (const entry of diffSuggestionsByFile) {
      const fileName = entry[0];
      const suggestions = entry[1];
      if (suggestions.size > 0 && fileName !== current) {
        filesWithSuggestions.push({
          fileName,
          count: suggestions.size
        });
        totalChanges += suggestions.size;
      }
    }
    filesWithSuggestions.sort((a, b) => a.fileName.localeCompare(b.fileName));
    return {
      files: filesWithSuggestions,
      totalFiles: filesWithSuggestions.length,
      totalChanges,
      nextFile: filesWithSuggestions.length > 0 ? filesWithSuggestions[0] : null
    };
  }

  // public/injected/modules/preview/stream.js
  var previewsMap = /* @__PURE__ */ new Map();
  function generateStatusId() {
    return "inline-status-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9);
  }
  function isFullLineSelection(view, from, to) {
    try {
      const startLine = view.state.doc.lineAt(from);
      const endLine = view.state.doc.lineAt(to);
      return from === startLine.from && (to === endLine.to || to === endLine.to + 1);
    } catch (e) {
      return false;
    }
  }
  function getLineRange(view, from, to) {
    try {
      const startLine = view.state.doc.lineAt(from);
      const endLine = view.state.doc.lineAt(to);
      return {
        startLine: startLine.number,
        endLine: endLine.number
      };
    } catch (e) {
      return { startLine: 1, endLine: 1 };
    }
  }
  function createInlineStatus(config) {
    const effects = window._diffSuggestionEffects || diffEffects;
    const view = getEditorView();
    if (!effects || !view) {
      console.warn("[InlineStatus] Effects or view not available");
      return null;
    }
    try {
      view.dispatch({
        effects: effects.addInlineStatusEffect.of(config)
      });
      const fileName = config.fileName || "unknown";
      if (!inlineStatusByFile.has(fileName)) {
        inlineStatusByFile.set(fileName, /* @__PURE__ */ new Map());
      }
      inlineStatusByFile.get(fileName).set(config.id, config);
      console.log("[InlineStatus] \u521B\u5EFA\u5185\u8054\u72B6\u6001:", config.id);
      return config.id;
    } catch (e) {
      console.error("[InlineStatus] \u521B\u5EFA\u5931\u8D25:", e);
      return null;
    }
  }
  function updateInlineStatusState(updates) {
    const effects = window._diffSuggestionEffects || diffEffects;
    const view = getEditorView();
    if (!effects || !view) return;
    try {
      view.dispatch({
        effects: effects.updateInlineStatusEffect.of(updates)
      });
    } catch (e) {
      console.error("[InlineStatus] \u66F4\u65B0\u5931\u8D25:", e);
    }
  }
  function removeInlineStatus(id) {
    const effects = window._diffSuggestionEffects || diffEffects;
    const view = getEditorView();
    if (!effects || !view) return;
    try {
      view.dispatch({
        effects: effects.removeInlineStatusEffect.of(id)
      });
      for (const entry of inlineStatusByFile) {
        const statusMap = entry[1];
        if (statusMap.has(id)) {
          statusMap.delete(id);
          break;
        }
      }
      console.log("[InlineStatus] \u79FB\u9664\u5185\u8054\u72B6\u6001:", id);
    } catch (e) {
      console.error("[InlineStatus] \u79FB\u9664\u5931\u8D25:", e);
    }
  }
  function startStreamPreview(data) {
    try {
      hideSelectionTooltip();
      const view = getEditorView();
      if (!view) {
        console.error("[OverleafBridge] EditorView not available for stream preview");
        return;
      }
      const previewId = data.previewId || "legacy-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9);
      const statusId = generateStatusId();
      const isInsertMode = !data.originalText || data.originalText.trim().length === 0;
      const isFullLine = isFullLineSelection(view, data.from, data.to);
      const lineRange = getLineRange(view, data.from, data.to);
      const preview = {
        id: statusId,
        previewId,
        action: data.action,
        originalText: data.originalText,
        newText: "",
        streamText: "",
        // 用于累积流式文本
        from: data.from,
        to: data.to,
        isInsertMode,
        isFullLine,
        lineRange,
        suggestionId: null,
        isStreaming: true
      };
      previewsMap.set(previewId, preview);
      const inlineStatusConfig = {
        id: statusId,
        fileName: getCurrentFileName(),
        from: data.from,
        to: data.to,
        widgetPos: data.from,
        originalText: data.originalText,
        newText: null,
        state: "generating",
        isFullLine,
        lineRange,
        action: data.action
      };
      createInlineStatus(inlineStatusConfig);
      console.log(
        "[OverleafBridge] Stream preview started:",
        "previewId:",
        previewId,
        "statusId:",
        statusId,
        "isFullLine:",
        isFullLine,
        "lines:",
        lineRange.startLine,
        "-",
        lineRange.endLine
      );
    } catch (e) {
      console.error("[OverleafBridge] Failed to start stream preview:", e);
    }
  }
  function updateStreamPreview(previewId, delta) {
    if (typeof previewId === "string" && delta === void 0) {
      delta = previewId;
      if (previewsMap.size === 0) return;
      const lastEntry = Array.from(previewsMap.entries()).pop();
      if (!lastEntry) return;
      previewId = lastEntry[0];
    }
    const preview = previewsMap.get(previewId);
    if (!preview || !preview.isStreaming) return;
    preview.streamText += delta;
    preview.newText = preview.streamText;
  }
  function completeStreamPreview(data) {
    let previewId = data && data.previewId;
    if (!previewId) {
      if (previewsMap.size === 0) return;
      const lastEntry = Array.from(previewsMap.entries()).pop();
      if (!lastEntry) return;
      previewId = lastEntry[0];
    }
    const preview = previewsMap.get(previewId);
    if (!preview) {
      console.warn("[OverleafBridge] \u627E\u4E0D\u5230\u9884\u89C8:", previewId);
      return;
    }
    preview.isStreaming = false;
    const newText = data && data.newText ? data.newText : preview.streamText;
    preview.newText = newText;
    removeInlineStatus(preview.id);
    if (!newText || newText.trim().length === 0) {
      console.log("[OverleafBridge] \u751F\u6210\u5931\u8D25\u6216\u8FD4\u56DE\u7A7A\u5185\u5BB9 previewId:", previewId);
      previewsMap.delete(previewId);
      return;
    }
    const view = getEditorView();
    if (!view) {
      console.error("[OverleafBridge] EditorView not available for suggestion");
      previewsMap.delete(previewId);
      return;
    }
    const waitForDiffAPI = function(callback, retries) {
      if (window.diffAPI) {
        callback();
      } else if (retries > 0) {
        setTimeout(function() {
          waitForDiffAPI(callback, retries - 1);
        }, 100);
      } else {
        console.error("[OverleafBridge] diffAPI not available");
      }
    };
    const currentPreview = preview;
    const currentPreviewId = previewId;
    const createDecisionCallbacks = function(action) {
      return {
        onAccept: function() {
          window.postMessage({
            type: "OVERLEAF_TEXT_ACTION_DECISION",
            data: {
              action,
              accepted: true
            }
          }, "*");
        },
        onReject: function() {
          window.postMessage({
            type: "OVERLEAF_TEXT_ACTION_DECISION",
            data: {
              action,
              accepted: false
            }
          }, "*");
        }
      };
    };
    waitForDiffAPI(function() {
      try {
        let suggestionId = null;
        const callbacks = createDecisionCallbacks(currentPreview.action);
        if (currentPreview.isInsertMode) {
          suggestionId = window.diffAPI.suggestSegmentWithId(
            "text-action-" + currentPreview.id,
            currentPreview.from,
            currentPreview.to,
            newText,
            callbacks
          );
        } else if (currentPreview.isFullLine) {
          const lineRange = currentPreview.lineRange;
          suggestionId = window.diffAPI.suggestRangeWithId(
            "text-action-" + currentPreview.id,
            lineRange.startLine,
            lineRange.endLine,
            newText,
            callbacks
          );
        } else {
          suggestionId = window.diffAPI.suggestSegmentWithId(
            "text-action-" + currentPreview.id,
            currentPreview.from,
            currentPreview.to,
            newText,
            callbacks
          );
        }
        currentPreview.suggestionId = suggestionId;
        console.log(
          "[OverleafBridge] Stream preview completed:",
          "previewId:",
          currentPreviewId,
          "suggestionId:",
          suggestionId,
          "action:",
          currentPreview.action
        );
        previewsMap.delete(currentPreviewId);
      } catch (e) {
        console.error("[OverleafBridge] Failed to create suggestion:", e, "previewId:", currentPreviewId);
        updateInlineStatusState({
          id: currentPreview.id,
          state: "error"
        });
        previewsMap.delete(currentPreviewId);
      }
    }, 10);
  }
  function cancelStreamPreview(previewId) {
    if (previewId) {
      const preview = previewsMap.get(previewId);
      if (preview) {
        removeInlineStatus(preview.id);
        previewsMap.delete(previewId);
        console.log("[OverleafBridge] \u53D6\u6D88\u9884\u89C8:", previewId);
      }
    } else {
      for (const [id, preview] of previewsMap) {
        removeInlineStatus(preview.id);
        console.log("[OverleafBridge] \u53D6\u6D88\u9884\u89C8:", id);
      }
      previewsMap.clear();
    }
  }
  function initStreamListeners() {
    window.addEventListener("keyup", function(event) {
      if (event.key === "Escape" && previewsMap.size > 0) {
        window.postMessage({
          type: "OVERLEAF_STREAM_CANCEL",
          data: { reason: "user_escape" }
        }, "*");
        cancelStreamPreview();
      }
    });
    window.addEventListener("message", function(event) {
      if (event.source !== window) return;
      const data = event.data;
      if (!data) return;
      if (data.type === "OVERLEAF_STREAM_PREVIEW_CANCELLED") {
        const previewId = data.data && data.data.previewId;
        if (previewId) {
          cancelStreamPreview(previewId);
        }
      }
    });
  }

  // public/injected/modules/preview/index.js
  function initPreview() {
    console.log("[OverleafBridge] Initializing Preview System (multi-task parallel mode)...");
    initStreamListeners();
    window.addEventListener("message", function(event) {
      if (event.source !== window) return;
      const data = event.data;
      if (!data) return;
      if (data.type === "OVERLEAF_STREAM_PREVIEW_START") {
        const previewId = data.data && data.data.previewId;
        console.log("[OverleafBridge] Starting stream preview, previewId:", previewId || "(legacy)");
        startStreamPreview(data.data);
      } else if (data.type === "OVERLEAF_STREAM_PREVIEW_UPDATE") {
        const previewId = data.data && data.data.previewId;
        const delta = data.data && data.data.delta;
        updateStreamPreview(previewId, delta);
      } else if (data.type === "OVERLEAF_STREAM_PREVIEW_COMPLETE") {
        const previewId = data.data && data.data.previewId;
        console.log("[OverleafBridge] Stream preview complete, previewId:", previewId || "(legacy)");
        completeStreamPreview(data.data);
      }
    });
  }

  // public/injected/modules/diff/ui.js
  var diffControlBar = null;
  var DIFF_CSS = `
  /* \u539F\u59CB\u5185\u5BB9 - \u6D45\u7EA2\u8272\u80CC\u666F\uFF0C\u9ED1\u8272\u5220\u9664\u7EBF */
  .diff-line-deleted {
    background: rgba(255, 0, 0, 0.08) !important;
    text-decoration: line-through !important;
    text-decoration-color: #000000 !important;
    color: #000000 !important;
    position: relative !important;
  }
  
  .diff-line-deleted::before {
    content: '\u2212';
    position: absolute;
    left: -20px;
    color: #c62828;
    font-weight: bold;
  }
  
  /* \u66FF\u6362\u5185\u5BB9\u5757 - \u6D45\u7EFF\u8272\u80CC\u666F\uFF0C\u9ED1\u8272\u6587\u5B57 */
  .diff-suggestion-block {
    position: relative;
    margin: 0;
    padding: 0;
  }
  
  .diff-new-content {
    background: rgba(76, 175, 80, 0.1);
    padding: 8px 16px;
    border-left: 3px solid #81c784;
    margin: 2px 0;
    font-family: inherit;
    font-size: inherit;
    line-height: 1.6;
    white-space: pre-wrap;
    word-wrap: break-word;
    position: relative;
    border-radius: 0 4px 4px 0;
  }
  
  .diff-new-content::before {
    /* content: '+'; \u5DF2\u79FB\u9664 */
    position: absolute;
    left: 5px;
    /* color: #4caf50; */
    font-weight: bold;
    display: none; /* \u9690\u85CF\u52A0\u53F7 */
  }
  
  .diff-new-text {
    color: #000000 !important;
  }
  
  /* \u884C\u5185\u6309\u94AE\u5BB9\u5668 */
  .diff-buttons {
    display: flex;
    justify-content: flex-end;
    margin-top: 4px;
    gap: 8px;
    z-index: 10;
  }
  
  .diff-btn {
    padding: 5px 14px;
    border: none;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.15);
  }
  
  .diff-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 2px 6px rgba(0,0,0,0.2);
  }
  
  .diff-btn-accept { background: #66bb6a; color: white; }
  .diff-btn-accept:hover { background: #4caf50; }
  .diff-btn-reject { background: #ef5350; color: white; }
  .diff-btn-reject:hover { background: #f44336; }
  
  /* ===== \u7247\u6BB5\u7EA7\u5EFA\u8BAE\u6837\u5F0F (Segment Suggestions) ===== */
  
  /* \u7247\u6BB5\u5220\u9664\u6837\u5F0F - inline strikethrough */
  .diff-segment-deleted {
    background: rgba(255, 0, 0, 0.15) !important;
    text-decoration: line-through !important;
    text-decoration-color: #c62828 !important;
    text-decoration-thickness: 2px !important;
  }
  
  /* \u7247\u6BB5\u65B0\u5185\u5BB9 - inline widget */
  .diff-segment-widget {
    display: inline;
    white-space: pre-wrap;
  }
  
  .diff-segment-new {
    background: rgba(76, 175, 80, 0.2);
    border-radius: 3px;
    padding: 1px 4px;
    margin-left: 2px;
    color: #1b5e20 !important;
    font-weight: 500;
  }
  
  /* \u7247\u6BB5\u7EA7 inline \u6309\u94AE */
  .diff-segment-buttons {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    margin-left: 4px;
    vertical-align: middle;
  }
  
  .diff-segment-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border: none;
    border-radius: 3px;
    font-size: 12px;
    font-weight: bold;
    cursor: pointer;
    transition: all 0.15s;
    padding: 0;
    line-height: 1;
  }
  
  .diff-segment-btn:hover {
    transform: scale(1.1);
  }
  
  .diff-segment-btn-accept {
    background: #4caf50;
    color: white;
  }
  
  .diff-segment-btn-accept:hover {
    background: #43a047;
  }
  
  .diff-segment-btn-reject {
    background: #ef5350;
    color: white;
  }
  
  .diff-segment-btn-reject:hover {
    background: #e53935;
  }
  
  /* \u7247\u6BB5\u5EFA\u8BAE\u52A8\u753B */
  @keyframes diff-segment-highlight {
    0% { opacity: 0; }
    100% { opacity: 1; }
  }
  
  .diff-segment-widget {
    animation: diff-segment-highlight 0.2s ease-out;
  }
  
  /* ===== \u5E95\u90E8\u56FA\u5B9A\u63A7\u5236\u680F ===== */
  #diff-control-bar {
    position: fixed;
    bottom: 60px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 9999;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background: #2d2d2d;
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.4);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 13px;
    color: #fff;
  }
  
  #diff-control-bar.hidden {
    display: none;
  }
  
  /* \u5BFC\u822A\u6A21\u5F0F\uFF08\u5F53\u524D\u6587\u4EF6\u65E0\u5EFA\u8BAE\uFF09 */
  #diff-control-bar.diff-control-bar-navigate-mode .diff-counter {
    cursor: pointer;
    padding: 4px 12px;
    background: rgba(76, 175, 80, 0.15);
    border-radius: 4px;
    border: 1px solid rgba(76, 175, 80, 0.3);
    transition: all 0.2s;
  }
  
  #diff-control-bar.diff-control-bar-navigate-mode .diff-counter:hover {
    background: rgba(76, 175, 80, 0.25);
    border-color: rgba(76, 175, 80, 0.5);
  }
  
  .diff-nav-btn.diff-nav-btn-go {
    width: auto;
    padding: 4px 12px;
    background: #4caf50;
    color: #fff;
    font-weight: 500;
    font-size: 12px;
  }
  
  .diff-nav-btn.diff-nav-btn-go:hover {
    background: #43a047;
  }
  
  /* \u5BFC\u822A\u7BAD\u5934 */
  .diff-nav-btn {
    width: 28px;
    height: 28px;
    border: none;
    background: transparent;
    color: #aaa;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    font-size: 18px;
    transition: all 0.15s;
  }
  
  .diff-nav-btn:hover {
    background: rgba(255,255,255,0.1);
    color: #fff;
  }
  
  .diff-nav-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
  
  /* \u8BA1\u6570\u5668 */
  .diff-counter {
    color: #aaa;
    font-size: 13px;
    min-width: 60px;
    text-align: center;
  }
  
  /* \u5206\u9694\u7EBF */
  .diff-separator {
    width: 1px;
    height: 24px;
    background: #555;
    margin: 0 8px;
  }
  
  /* \u63A7\u5236\u680F\u6309\u94AE */
  .diff-bar-btn {
    padding: 6px 16px;
    border: 1px solid #555;
    border-radius: 4px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    color: #ddd;
  }
  
  .diff-bar-btn:hover {
    background: rgba(255,255,255,0.1);
    border-color: #777;
  }
  
  .diff-bar-btn-reject {
    color: #ff8a80;
    border-color: #ff8a80;
  }
  
  .diff-bar-btn-reject:hover {
    background: rgba(255,138,128,0.15);
  }
  
  .diff-bar-btn-accept {
    background: #4caf50;
    border-color: #4caf50;
    color: white;
  }
  
  .diff-bar-btn-accept:hover {
    background: #43a047;
    border-color: #43a047;
  }
  
  /* \u5FEB\u6377\u952E\u63D0\u793A */
  .diff-shortcut {
    font-size: 11px;
    color: #888;
    margin-left: 4px;
  }
  
  /* \u52A8\u753B */
  @keyframes diff-highlight {
    0% { opacity: 0; transform: translateX(-10px); }
    100% { opacity: 1; transform: translateX(0); }
  }
  
  .diff-suggestion-block {
    animation: diff-highlight 0.3s ease-out;
  }
  
  @keyframes diff-bar-slide-up {
    0% { opacity: 0; transform: translate(-50%, 20px); }
    100% { opacity: 1; transform: translate(-50%, 0); }
  }
  
  #diff-control-bar {
    animation: diff-bar-slide-up 0.3s ease-out;
  }
  
  /* ===== \u5185\u8054\u751F\u6210\u6307\u793A\u5668\u6837\u5F0F (Inline Generating Spinner) ===== */
  
  /* \u751F\u6210\u4E2D\u7684\u6587\u672C\u6837\u5F0F - \u6D45\u7EA2\u8272\u80CC\u666F + \u5220\u9664\u7EBF\uFF08\u4E0E suggestion \u7CFB\u7EDF\u4E00\u81F4\uFF09 */
  .inline-generating-text {
    background: rgba(255, 0, 0, 0.15) !important;
    text-decoration: line-through !important;
    text-decoration-color: #c62828 !important;
    text-decoration-thickness: 2px !important;
  }
  
  /* \u65CB\u8F6C\u6307\u793A\u5668 - \u663E\u793A\u5728\u6587\u672C\u540E\u9762 */
  .inline-generating-spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid #3b82f6;
    border-top-color: transparent;
    border-radius: 50%;
    animation: inline-generating-spin 0.8s linear infinite;
    margin-left: 6px;
    vertical-align: middle;
  }
  
  @keyframes inline-generating-spin {
    to { transform: rotate(360deg); }
  }
`;
  function injectDiffStyles() {
    const oldDiffStyle = document.getElementById("diff-suggestion-styles");
    if (oldDiffStyle) oldDiffStyle.remove();
    const diffStyle = document.createElement("style");
    diffStyle.id = "diff-suggestion-styles";
    diffStyle.textContent = DIFF_CSS;
    document.head.appendChild(diffStyle);
  }
  function createDiffControlBar(callbacks) {
    const { onPrev, onNext, onJumpNextFile, onRejectAll, onAcceptAll } = callbacks;
    const oldDiffBar = document.getElementById("diff-control-bar");
    if (oldDiffBar) oldDiffBar.remove();
    if (diffControlBar && diffControlBar.parentNode) {
      diffControlBar.remove();
    }
    diffControlBar = document.createElement("div");
    diffControlBar.id = "diff-control-bar";
    diffControlBar.className = "hidden";
    diffControlBar.innerHTML = '<button class="diff-nav-btn" id="diff-prev-btn" title="\u4E0A\u4E00\u4E2A">\u2039</button><span class="diff-counter" id="diff-counter">0 of 0</span><button class="diff-nav-btn" id="diff-next-btn" title="\u4E0B\u4E00\u4E2A">\u203A</button><div class="diff-separator"></div><button class="diff-bar-btn diff-bar-btn-reject" id="diff-reject-all-btn">Undo File</button><button class="diff-bar-btn diff-bar-btn-accept" id="diff-accept-all-btn">Keep File <span class="diff-shortcut">Ctrl+S</span></button>';
    document.body.appendChild(diffControlBar);
    document.getElementById("diff-prev-btn").addEventListener("click", onPrev);
    document.getElementById("diff-next-btn").addEventListener("click", onNext);
    document.getElementById("diff-counter").addEventListener("click", function() {
      const currentFileCount = getCurrentFileSuggestions().size;
      if (currentFileCount === 0) {
        onJumpNextFile();
      }
    });
    document.getElementById("diff-reject-all-btn").addEventListener("click", onRejectAll);
    document.getElementById("diff-accept-all-btn").addEventListener("click", onAcceptAll);
    return diffControlBar;
  }
  function updateDiffControlBar() {
    if (!diffControlBar) return;
    const totalCount = getTotalSuggestionsCount();
    const counter = document.getElementById("diff-counter");
    const prevBtn = document.getElementById("diff-prev-btn");
    const nextBtn = document.getElementById("diff-next-btn");
    const acceptAllBtn = document.getElementById("diff-accept-all-btn");
    const rejectAllBtn = document.getElementById("diff-reject-all-btn");
    const currentFileSuggestions = getCurrentFileSuggestions();
    const currentFileCount = currentFileSuggestions.size;
    if (totalCount === 0) {
      diffControlBar.classList.add("hidden");
      diffControlBar.classList.remove("diff-control-bar-navigate-mode");
    } else {
      diffControlBar.classList.remove("hidden");
      if (currentFileCount === 0) {
        const filesInfo = getFilesWithSuggestions();
        if (filesInfo.nextFile) {
          diffControlBar.classList.add("diff-control-bar-navigate-mode");
          let displayText = "\u{1F4C1} " + filesInfo.nextFile.fileName;
          if (filesInfo.totalFiles > 1) {
            displayText += " (" + filesInfo.totalChanges + " changes in " + filesInfo.totalFiles + " files)";
          } else {
            displayText += " (" + filesInfo.nextFile.count + " changes)";
          }
          counter.textContent = displayText;
          counter.title = "\u70B9\u51FB\u8DF3\u8F6C\u5230 " + filesInfo.nextFile.fileName;
          prevBtn.style.display = "none";
          nextBtn.textContent = "Go \u2192";
          nextBtn.title = "\u8DF3\u8F6C\u5230 " + filesInfo.nextFile.fileName;
          nextBtn.disabled = false;
          nextBtn.classList.add("diff-nav-btn-go");
          if (acceptAllBtn) acceptAllBtn.style.display = "none";
          if (rejectAllBtn) rejectAllBtn.style.display = "none";
        }
      } else {
        diffControlBar.classList.remove("diff-control-bar-navigate-mode");
        prevBtn.style.display = "";
        prevBtn.textContent = "\u2039";
        nextBtn.textContent = "\u203A";
        nextBtn.title = "\u4E0B\u4E00\u4E2A";
        nextBtn.classList.remove("diff-nav-btn-go");
        if (acceptAllBtn) acceptAllBtn.style.display = "";
        if (rejectAllBtn) rejectAllBtn.style.display = "";
        const fileCount = diffSuggestionsByFile.size;
        if (fileCount > 1) {
          counter.textContent = diffCurrentIndex + 1 + " of " + totalCount + " (" + fileCount + " files)";
        } else {
          counter.textContent = diffCurrentIndex + 1 + " of " + totalCount;
        }
        counter.title = "";
        prevBtn.disabled = false;
        nextBtn.disabled = false;
      }
    }
  }

  // public/injected/modules/diff/api.js
  var diffSuggestionId = 0;
  function getLatestSuggestionPosition(suggestionId) {
    if (!diffCurrentView) return null;
    try {
      const field = diffCurrentView.state.field(diffSuggestionField);
      if (field && field.suggestions) {
        return field.suggestions.get(suggestionId);
      }
    } catch (e) {
      console.warn("[DiffAPI] \u83B7\u53D6\u6700\u65B0\u884C\u7EA7\u5EFA\u8BAE\u4F4D\u7F6E\u5931\u8D25:", e);
    }
    return null;
  }
  function getLatestSegmentPosition(suggestionId) {
    if (!diffCurrentView) return null;
    try {
      const field = diffCurrentView.state.field(diffSuggestionField);
      if (field && field.segments) {
        return field.segments.get(suggestionId);
      }
    } catch (e) {
      console.warn("[DiffAPI] \u83B7\u53D6\u6700\u65B0\u7247\u6BB5\u5EFA\u8BAE\u4F4D\u7F6E\u5931\u8D25:", e);
    }
    return null;
  }
  function getSortedSuggestionsAcrossFiles() {
    const result = [];
    for (const entry of diffSuggestionsByFile) {
      const fileName = entry[0];
      const suggestions = entry[1];
      const isCurrentFile = fileName === diffCurrentFileName;
      for (const suggEntry of suggestions) {
        const id = suggEntry[0];
        const config = suggEntry[1];
        let pos = config.lineFrom || 0;
        if (isCurrentFile) {
          const latest = getLatestSuggestionPosition(id);
          if (latest) pos = latest.lineFrom;
        }
        result.push({
          id,
          fileName,
          config,
          pos,
          isCurrentFile
        });
      }
    }
    result.sort((a, b) => {
      if (a.fileName !== b.fileName) {
        return a.fileName.localeCompare(b.fileName);
      }
      return a.pos - b.pos;
    });
    return result;
  }
  function scrollToSuggestion(suggestionId, config) {
    if (!diffCurrentView) return;
    const latest = getLatestSuggestionPosition(suggestionId);
    const targetConfig = latest || config;
    if (targetConfig) {
      try {
        const EditorView = diffCurrentView.constructor;
        diffCurrentView.dispatch({
          effects: EditorView.scrollIntoView(targetConfig.lineFrom, { y: "center" })
        });
      } catch (e) {
        console.warn("[DiffAPI] \u6EDA\u52A8\u5931\u8D25:", e);
      }
    }
  }
  function jumpToDiffSuggestion(index) {
    const sortedList = getSortedSuggestionsAcrossFiles();
    if (index < 0 || index >= sortedList.length) return;
    setDiffCurrentIndex(index);
    const item = sortedList[index];
    if (item.fileName !== diffCurrentFileName) {
      console.log("[DiffAPI] \u8DE8\u6587\u4EF6\u8DF3\u8F6C:", diffCurrentFileName, "->", item.fileName);
      methodHandlers.switchFile(item.fileName);
      setTimeout(function() {
        scrollToSuggestion(item.id, item.config);
      }, 500);
    } else {
      scrollToSuggestion(item.id, item.config);
    }
    updateDiffControlBar();
  }
  function jumpToNextFileWithSuggestions() {
    const filesInfo = getFilesWithSuggestions(diffCurrentFileName);
    const nextFile = filesInfo.nextFile;
    if (!nextFile) {
      console.log("[DiffAPI] \u6CA1\u6709\u5176\u4ED6\u6587\u4EF6\u6709\u5EFA\u8BAE");
      return false;
    }
    console.log("[DiffAPI] \u8DF3\u8F6C\u5230\u6587\u4EF6:", nextFile.fileName, "(" + nextFile.count + "\u4E2A\u5EFA\u8BAE)");
    methodHandlers.switchFile(nextFile.fileName);
    setTimeout(function() {
      const sortedList = getSortedSuggestionsAcrossFiles();
      for (let i = 0; i < sortedList.length; i++) {
        if (sortedList[i].fileName === nextFile.fileName) {
          setDiffCurrentIndex(i);
          const item = sortedList[i];
          scrollToSuggestion(item.id, item.config);
          updateDiffControlBar();
          break;
        }
      }
    }, 500);
    return true;
  }
  function setupDiffAPI() {
    if (!diffEffects) {
      console.error("[DiffAPI] \u6548\u679C\u672A\u521D\u59CB\u5316");
      return;
    }
    window.diffAPI = {
      // 单行建议
      suggest: function(lineNum, newContent, callbacks = {}) {
        try {
          const line = diffCurrentView.state.doc.line(lineNum);
          const id = "suggestion-" + diffSuggestionId++;
          const oldContent = line.text;
          const fileName = diffCurrentFileName;
          const config = {
            id,
            fileName,
            lineNum,
            startLine: lineNum,
            endLine: lineNum,
            oldContent,
            newContent,
            lineFrom: line.from,
            lineTo: line.to,
            widgetPos: line.to,
            onAccept: (view, suggestionId) => {
              const fileSuggestions = diffSuggestionsByFile.get(fileName);
              const suggestion = fileSuggestions ? fileSuggestions.get(suggestionId) : null;
              const latest = getLatestSuggestionPosition(suggestionId);
              const from = latest ? latest.lineFrom : suggestion ? suggestion.lineFrom : 0;
              const to = latest ? latest.lineTo : suggestion ? suggestion.lineTo : 0;
              if (suggestion && diffEffects) {
                view.dispatch({
                  changes: { from, to, insert: suggestion.newContent },
                  effects: diffEffects.removeDiffSuggestionEffect.of(suggestionId)
                });
                window.postMessage({
                  type: "DIFF_SUGGESTION_RESOLVED",
                  data: { id: suggestionId, accepted: true, oldContent: suggestion.oldContent, newContent: suggestion.newContent }
                }, "*");
                fileSuggestions.delete(suggestionId);
                const totalCount = getTotalSuggestionsCount();
                if (diffCurrentIndex >= totalCount) setDiffCurrentIndex(Math.max(0, totalCount - 1));
                updateDiffControlBar();
                console.log("[DiffAPI] \u5DF2\u63A5\u53D7\u5EFA\u8BAE:", suggestionId);
                if (callbacks.onAccept) callbacks.onAccept(oldContent, newContent);
              }
            },
            onReject: (view, suggestionId) => {
              if (diffEffects) {
                view.dispatch({ effects: diffEffects.removeDiffSuggestionEffect.of(suggestionId) });
              }
              window.postMessage({
                type: "DIFF_SUGGESTION_RESOLVED",
                data: { id: suggestionId, accepted: false }
              }, "*");
              const fileSuggestions = diffSuggestionsByFile.get(fileName);
              if (fileSuggestions) fileSuggestions.delete(suggestionId);
              const totalCount = getTotalSuggestionsCount();
              if (diffCurrentIndex >= totalCount) setDiffCurrentIndex(Math.max(0, totalCount - 1));
              updateDiffControlBar();
              console.log("[DiffAPI] \u5DF2\u62D2\u7EDD\u5EFA\u8BAE:", suggestionId);
              if (callbacks.onReject) callbacks.onReject(oldContent, newContent);
            }
          };
          getCurrentFileSuggestions(fileName).set(id, config);
          if (diffEffects) {
            diffCurrentView.dispatch({ effects: diffEffects.addDiffSuggestionEffect.of(config) });
          }
          updateDiffControlBar();
          console.log("[DiffAPI] \u5EFA\u8BAE\u5DF2\u521B\u5EFA:", id, "\u7B2C", lineNum, "\u884C", "\u6587\u4EF6:", fileName);
          return id;
        } catch (e) {
          console.error("[DiffAPI] \u521B\u5EFA\u5EFA\u8BAE\u5931\u8D25:", e);
          return null;
        }
      },
      // 更多方法实现 (suggestRange, suggestSegment 等)
      // 这里为了简洁省略部分重复逻辑，但在实际迁移时需要完整保留
      // 下面实现 acceptAll, rejectAll 等核心方法
      suggestRangeWithId: function(externalId, startLine, endLine, newContent, callbacks = {}) {
        try {
          const lineStart = diffCurrentView.state.doc.line(startLine);
          const lineEnd = diffCurrentView.state.doc.line(endLine);
          const oldContent = diffCurrentView.state.doc.sliceString(lineStart.from, lineEnd.to);
          const fileName = diffCurrentFileName;
          const config = {
            id: externalId,
            fileName,
            startLine,
            endLine,
            oldContent,
            newContent,
            lineFrom: lineStart.from,
            lineTo: lineEnd.to,
            widgetPos: lineEnd.to,
            onAccept: (view, suggestionId) => {
              const fileSuggestions = diffSuggestionsByFile.get(fileName);
              const suggestion = fileSuggestions ? fileSuggestions.get(suggestionId) : null;
              const latest = getLatestSuggestionPosition(suggestionId);
              const from = latest ? latest.lineFrom : suggestion ? suggestion.lineFrom : 0;
              const to = latest ? latest.lineTo : suggestion ? suggestion.lineTo : 0;
              if (suggestion && diffEffects) {
                view.dispatch({
                  changes: { from, to, insert: suggestion.newContent },
                  effects: diffEffects.removeDiffSuggestionEffect.of(suggestionId)
                });
                window.postMessage({
                  type: "DIFF_SUGGESTION_RESOLVED",
                  data: { id: suggestionId, accepted: true, oldContent: suggestion.oldContent, newContent: suggestion.newContent }
                }, "*");
                fileSuggestions.delete(suggestionId);
                const totalCount = getTotalSuggestionsCount();
                if (diffCurrentIndex >= totalCount) setDiffCurrentIndex(Math.max(0, totalCount - 1));
                updateDiffControlBar();
                if (callbacks.onAccept) callbacks.onAccept();
              }
            },
            onReject: (view, suggestionId) => {
              if (diffEffects) {
                view.dispatch({ effects: diffEffects.removeDiffSuggestionEffect.of(suggestionId) });
              }
              window.postMessage({
                type: "DIFF_SUGGESTION_RESOLVED",
                data: { id: suggestionId, accepted: false }
              }, "*");
              const fileSuggestions = diffSuggestionsByFile.get(fileName);
              if (fileSuggestions) fileSuggestions.delete(suggestionId);
              const totalCount = getTotalSuggestionsCount();
              if (diffCurrentIndex >= totalCount) setDiffCurrentIndex(Math.max(0, totalCount - 1));
              updateDiffControlBar();
              if (callbacks.onReject) callbacks.onReject();
            }
          };
          getCurrentFileSuggestions(fileName).set(externalId, config);
          if (diffEffects) {
            diffCurrentView.dispatch({ effects: diffEffects.addDiffSuggestionEffect.of(config) });
          }
          updateDiffControlBar();
          console.log("[DiffAPI] \u5EFA\u8BAE\u5DF2\u521B\u5EFA\uFF08\u5916\u90E8ID\uFF09:", externalId, "\u7B2C", startLine, "-", endLine, "\u884C", "\u6587\u4EF6:", fileName);
          return externalId;
        } catch (e) {
          console.error("[DiffAPI] \u521B\u5EFA\u5EFA\u8BAE\u5931\u8D25:", e);
          return null;
        }
      },
      suggestSegmentWithId: function(externalId, startOffset, endOffset, newContent, callbacks = {}) {
        try {
          const oldContent = diffCurrentView.state.doc.sliceString(startOffset, endOffset);
          const fileName = diffCurrentFileName;
          const config = {
            id: externalId,
            type: "segment",
            fileName,
            startOffset,
            endOffset,
            widgetPos: endOffset,
            oldContent,
            newContent,
            onAccept: (view, suggestionId) => {
              const fileSuggestions = diffSuggestionsByFile.get(fileName);
              const suggestion = fileSuggestions ? fileSuggestions.get(suggestionId) : null;
              const latest = getLatestSegmentPosition(suggestionId);
              const from = latest ? latest.startOffset : suggestion ? suggestion.startOffset : 0;
              const to = latest ? latest.endOffset : suggestion ? suggestion.endOffset : 0;
              if (suggestion && diffEffects) {
                view.dispatch({
                  changes: { from, to, insert: suggestion.newContent },
                  effects: diffEffects.removeSegmentSuggestionEffect.of(suggestionId)
                });
                window.postMessage({
                  type: "DIFF_SUGGESTION_RESOLVED",
                  data: { id: suggestionId, accepted: true, oldContent: suggestion.oldContent, newContent: suggestion.newContent }
                }, "*");
                fileSuggestions.delete(suggestionId);
                const totalCount = getTotalSuggestionsCount();
                if (diffCurrentIndex >= totalCount) setDiffCurrentIndex(Math.max(0, totalCount - 1));
                updateDiffControlBar();
                if (callbacks.onAccept) callbacks.onAccept();
              }
            },
            onReject: (view, suggestionId) => {
              if (diffEffects) {
                view.dispatch({ effects: diffEffects.removeSegmentSuggestionEffect.of(suggestionId) });
              }
              window.postMessage({
                type: "DIFF_SUGGESTION_RESOLVED",
                data: { id: suggestionId, accepted: false }
              }, "*");
              const fileSuggestions = diffSuggestionsByFile.get(fileName);
              if (fileSuggestions) fileSuggestions.delete(suggestionId);
              const totalCount = getTotalSuggestionsCount();
              if (diffCurrentIndex >= totalCount) setDiffCurrentIndex(Math.max(0, totalCount - 1));
              updateDiffControlBar();
              if (callbacks.onReject) callbacks.onReject();
            }
          };
          getCurrentFileSuggestions(fileName).set(externalId, config);
          if (diffEffects) {
            diffCurrentView.dispatch({ effects: diffEffects.addSegmentSuggestionEffect.of(config) });
          }
          updateDiffControlBar();
          console.log("[DiffAPI] \u7247\u6BB5\u5EFA\u8BAE\u5DF2\u521B\u5EFA\uFF08\u5916\u90E8ID\uFF09:", externalId, "\u504F\u79FB", startOffset, "-", endOffset, "\u6587\u4EF6:", fileName);
          return externalId;
        } catch (e) {
          console.error("[DiffAPI] \u521B\u5EFA\u7247\u6BB5\u5EFA\u8BAE\u5931\u8D25:", e);
          return null;
        }
      },
      prev: function() {
        const totalCount = getTotalSuggestionsCount();
        if (totalCount === 0) return;
        const currentFileCount = getCurrentFileSuggestions().size;
        if (currentFileCount === 0) {
          jumpToNextFileWithSuggestions();
          return;
        }
        if (diffCurrentIndex > 0) {
          jumpToDiffSuggestion(diffCurrentIndex - 1);
        } else {
          jumpToDiffSuggestion(diffCurrentIndex);
        }
      },
      next: function() {
        const totalCount = getTotalSuggestionsCount();
        if (totalCount === 0) return;
        const currentFileCount = getCurrentFileSuggestions().size;
        if (currentFileCount === 0) {
          jumpToNextFileWithSuggestions();
          return;
        }
        if (diffCurrentIndex < totalCount - 1) {
          jumpToDiffSuggestion(diffCurrentIndex + 1);
        } else {
          jumpToDiffSuggestion(diffCurrentIndex);
        }
      },
      acceptAll: function() {
        const fileSuggestions = getCurrentFileSuggestions();
        const ids = Array.from(fileSuggestions.keys());
        for (let i = ids.length - 1; i >= 0; i--) {
          const config = fileSuggestions.get(ids[i]);
          if (config && config.onAccept) {
            config.onAccept(diffCurrentView, ids[i]);
          }
        }
        console.log("[DiffAPI] \u5DF2\u63A5\u53D7\u5F53\u524D\u6587\u4EF6\u6240\u6709\u5EFA\u8BAE");
      },
      rejectAll: function() {
        const fileSuggestions = getCurrentFileSuggestions();
        const ids = Array.from(fileSuggestions.keys());
        for (let j = 0; j < ids.length; j++) {
          const config = fileSuggestions.get(ids[j]);
          if (config && config.onReject) {
            config.onReject(diffCurrentView, ids[j]);
          }
        }
        console.log("[DiffAPI] \u5DF2\u62D2\u7EDD\u5F53\u524D\u6587\u4EF6\u6240\u6709\u5EFA\u8BAE");
      },
      clearAll: function() {
        const fileSuggestions = getCurrentFileSuggestions();
        const ids = Array.from(fileSuggestions.keys());
        for (let k = 0; k < ids.length; k++) {
          window.postMessage({
            type: "DIFF_SUGGESTION_RESOLVED",
            data: { id: ids[k], accepted: false }
          }, "*");
        }
        fileSuggestions.clear();
        const totalCount = getTotalSuggestionsCount();
        if (diffCurrentIndex >= totalCount) setDiffCurrentIndex(Math.max(0, totalCount - 1));
        if (diffEffects) {
          diffCurrentView.dispatch({
            effects: [
              diffEffects.clearDiffSuggestionsEffect.of(null),
              diffEffects.clearSegmentSuggestionsEffect.of(null)
            ]
          });
        }
        updateDiffControlBar();
        console.log("[DiffAPI] \u5F53\u524D\u6587\u4EF6\u6240\u6709\u5EFA\u8BAE\u5DF2\u6E05\u9664");
      },
      clearAllFiles: function() {
        for (const entry of diffSuggestionsByFile) {
          const suggestions = entry[1];
          for (const suggEntry of suggestions) {
            window.postMessage({
              type: "DIFF_SUGGESTION_RESOLVED",
              data: { id: suggEntry[0], accepted: false }
            }, "*");
          }
        }
        diffSuggestionsByFile.clear();
        setDiffCurrentIndex(0);
        if (diffEffects) {
          diffCurrentView.dispatch({
            effects: [
              diffEffects.clearDiffSuggestionsEffect.of(null),
              diffEffects.clearSegmentSuggestionsEffect.of(null)
            ]
          });
        }
        updateDiffControlBar();
        console.log("[DiffAPI] \u6240\u6709\u6587\u4EF6\u7684\u5EFA\u8BAE\u5DF2\u6E05\u9664");
      }
    };
    console.log("[DiffAPI] Diff API \u51C6\u5907\u5C31\u7EEA!");
  }
  function initDiffMessageListeners() {
    window.addEventListener("message", function(event) {
      if (event.source !== window) return;
      const data = event.data;
      if (!data) return;
      if (data.type === "DIFF_CREATE_SUGGESTION") {
        if (window.diffAPI) {
          window.diffAPI.suggestRangeWithId(
            data.data.id,
            data.data.startLine,
            data.data.endLine,
            data.data.newContent
          );
        }
      } else if (data.type === "DIFF_CREATE_BATCH") {
        const suggestions = data.data.suggestions;
        if (window.diffAPI && suggestions) {
          for (let i = 0; i < suggestions.length; i++) {
            const s = suggestions[i];
            window.diffAPI.suggestRangeWithId(s.id, s.startLine, s.endLine, s.newContent);
          }
        }
      } else if (data.type === "DIFF_CREATE_SEGMENT_SUGGESTION") {
        if (window.diffAPI) {
          window.diffAPI.suggestSegmentWithId(
            data.data.id,
            data.data.startOffset,
            data.data.endOffset,
            data.data.newContent
          );
        }
      } else if (data.type === "DIFF_CREATE_SEGMENT_BATCH") {
        const segmentSuggestions = data.data.suggestions;
        if (window.diffAPI && segmentSuggestions) {
          for (let j = 0; j < segmentSuggestions.length; j++) {
            const seg = segmentSuggestions[j];
            window.diffAPI.suggestSegmentWithId(seg.id, seg.startOffset, seg.endOffset, seg.newContent);
          }
        }
      } else if (data.type === "DIFF_ACCEPT_ALL") {
        if (window.diffAPI) window.diffAPI.acceptAll();
      } else if (data.type === "DIFF_REJECT_ALL") {
        if (window.diffAPI) window.diffAPI.rejectAll();
      } else if (data.type === "DIFF_CLEAR_ALL") {
        if (window.diffAPI) window.diffAPI.clearAll();
      }
    });
  }

  // public/injected/modules/diff/index.js
  var diffCodeMirror = null;
  function restoreSuggestionsForCurrentFile() {
    if (!diffCurrentView || !diffCurrentFileName) {
      updateDiffControlBar();
      return;
    }
    const suggestions = getCurrentFileSuggestions();
    const inlineStatus = getCurrentFileInlineStatus();
    if (!diffEffects) {
      updateDiffControlBar();
      return;
    }
    try {
      diffCurrentView.dispatch({
        effects: [
          diffEffects.clearDiffSuggestionsEffect.of(null),
          diffEffects.clearSegmentSuggestionsEffect.of(null),
          diffEffects.clearInlineStatusEffect.of(null)
        ]
      });
    } catch (e) {
    }
    if (suggestions.size === 0 && inlineStatus.size === 0) {
      console.log("[DiffAPI] \u5F53\u524D\u6587\u4EF6\u65E0\u5EFA\u8BAE:", diffCurrentFileName);
      updateDiffControlBar();
      return;
    }
    console.log("[DiffAPI] \u6062\u590D\u6587\u4EF6\u5EFA\u8BAE:", diffCurrentFileName, "\u5171", suggestions.size, "\u4E2A\u5EFA\u8BAE,", inlineStatus.size, "\u4E2A\u5185\u8054\u72B6\u6001");
    const toRemove = [];
    for (const entry of suggestions) {
      const id = entry[0];
      const config = entry[1];
      try {
        if (config.type === "segment") {
          const docContent = diffCurrentView.state.doc.toString();
          const foundIndex = docContent.indexOf(config.oldContent);
          if (foundIndex !== -1) {
            config.startOffset = foundIndex;
            config.endOffset = foundIndex + config.oldContent.length;
            config.widgetPos = config.endOffset;
            diffCurrentView.dispatch({ effects: diffEffects.addSegmentSuggestionEffect.of(config) });
          } else {
            console.warn("[DiffAPI] \u6062\u590D\u7247\u6BB5\u5EFA\u8BAE\u5931\u8D25\uFF0C\u627E\u4E0D\u5230\u539F\u59CB\u5185\u5BB9:", id);
            toRemove.push(id);
          }
        } else {
          const lineStart = diffCurrentView.state.doc.line(config.startLine);
          const lineEnd = diffCurrentView.state.doc.line(config.endLine);
          config.lineFrom = lineStart.from;
          config.lineTo = lineEnd.to;
          config.widgetPos = lineEnd.to;
          diffCurrentView.dispatch({ effects: diffEffects.addDiffSuggestionEffect.of(config) });
        }
      } catch (e) {
        console.warn("[DiffAPI] \u6062\u590D\u5EFA\u8BAE\u5931\u8D25:", id, e);
        toRemove.push(id);
      }
    }
    for (const id of toRemove) {
      suggestions.delete(id);
    }
    const statusToRemove = [];
    for (const entry of inlineStatus) {
      const id = entry[0];
      const config = entry[1];
      try {
        const docContent = diffCurrentView.state.doc.toString();
        if (config.originalText) {
          const foundIndex = docContent.indexOf(config.originalText);
          if (foundIndex !== -1) {
            config.from = foundIndex;
            config.to = foundIndex + config.originalText.length;
            config.widgetPos = foundIndex;
            diffCurrentView.dispatch({ effects: diffEffects.addInlineStatusEffect.of(config) });
          } else {
            console.warn("[InlineStatus] \u6062\u590D\u5185\u8054\u72B6\u6001\u5931\u8D25\uFF0C\u627E\u4E0D\u5230\u539F\u59CB\u5185\u5BB9:", id);
            statusToRemove.push(id);
          }
        } else {
          diffCurrentView.dispatch({ effects: diffEffects.addInlineStatusEffect.of(config) });
        }
      } catch (e) {
        console.warn("[InlineStatus] \u6062\u590D\u5185\u8054\u72B6\u6001\u5931\u8D25:", id, e);
        statusToRemove.push(id);
      }
    }
    for (const id of statusToRemove) {
      inlineStatus.delete(id);
    }
    updateDiffControlBar();
  }
  function onFileChanged(oldFileName, newFileName) {
    setTimeout(() => {
      restoreSuggestionsForCurrentFile();
    }, 300);
  }
  function checkFileChange() {
    try {
      const currentFile = methodHandlers.getCurrentFile ? methodHandlers.getCurrentFile() : { name: getCurrentFileName() };
      const newFileName = currentFile ? currentFile.name : null;
      if (newFileName && newFileName !== diffCurrentFileName) {
        console.log("[DiffAPI] \u68C0\u6D4B\u5230\u6587\u4EF6\u5207\u6362:", diffCurrentFileName, "->", newFileName);
        const oldFileName = diffCurrentFileName;
        setDiffCurrentFileName(newFileName);
        onFileChanged(oldFileName, newFileName);
      }
    } catch (e) {
    }
  }
  function startFileChangeListener() {
    if (diffFileCheckInterval) return;
    try {
      const currentFile = methodHandlers.getCurrentFile ? methodHandlers.getCurrentFile() : { name: getCurrentFileName() };
      setDiffCurrentFileName(currentFile ? currentFile.name : null);
      console.log("[DiffAPI] \u521D\u59CB\u6587\u4EF6:", diffCurrentFileName);
    } catch (e) {
    }
    const interval = setInterval(checkFileChange, 500);
    setDiffFileCheckInterval(interval);
  }
  function initDiffSystem() {
    console.log("[OverleafBridge] Initializing Diff System...");
    injectDiffStyles();
    initDiffMessageListeners();
    window.addEventListener("UNSTABLE_editor:extensions", function(evt) {
      const detail = evt.detail;
      const CM = detail.CodeMirror;
      const extensions = detail.extensions;
      diffCodeMirror = CM;
      console.log("[DiffAPI] \u6355\u83B7\u5230 CodeMirror \u5B9E\u4F8B");
      const diffSuggestionExtension = createDiffSuggestionExtension(CM);
      extensions.push(diffSuggestionExtension);
      console.log("[DiffAPI] Diff \u5EFA\u8BAE\u6269\u5C55\u5DF2\u6CE8\u518C");
    });
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("editor:extension-loaded"));
      setTimeout(() => {
        const store = window.overleaf && window.overleaf.unstable && window.overleaf.unstable.store;
        const view = store && store.get("editor.view") || document.querySelector(".cm-content") && document.querySelector(".cm-content").cmView && document.querySelector(".cm-content").cmView.view;
        setDiffCurrentView(view);
        if (view) {
          console.log("[DiffAPI] \u7F16\u8F91\u5668\u89C6\u56FE\u5DF2\u83B7\u53D6");
          createDiffControlBar({
            onPrev: () => window.diffAPI && window.diffAPI.prev(),
            onNext: () => window.diffAPI && window.diffAPI.next(),
            onJumpNextFile: () => jumpToNextFileWithSuggestions(),
            onRejectAll: () => window.diffAPI && window.diffAPI.rejectAll(),
            onAcceptAll: () => window.diffAPI && window.diffAPI.acceptAll()
          });
          setupDiffAPI();
          startFileChangeListener();
        } else {
          console.warn("[DiffAPI] \u65E0\u6CD5\u83B7\u53D6\u7F16\u8F91\u5668\u89C6\u56FE\uFF0C\u7A0D\u540E\u91CD\u8BD5");
          setTimeout(() => {
            const retryView = window.overleaf?.unstable?.store?.get("editor.view") || document.querySelector(".cm-content")?.cmView?.view;
            if (retryView) {
              setDiffCurrentView(retryView);
              console.log("[DiffAPI] \u7F16\u8F91\u5668\u89C6\u56FE\u5DF2\u83B7\u53D6\uFF08\u91CD\u8BD5\uFF09");
              createDiffControlBar({
                onPrev: () => window.diffAPI && window.diffAPI.prev(),
                onNext: () => window.diffAPI && window.diffAPI.next(),
                onJumpNextFile: () => jumpToNextFileWithSuggestions(),
                onRejectAll: () => window.diffAPI && window.diffAPI.rejectAll(),
                onAcceptAll: () => window.diffAPI && window.diffAPI.acceptAll()
              });
              setupDiffAPI();
              startFileChangeListener();
            }
          }, 2e3);
        }
      }, 500);
    }, 100);
  }

  // public/injected/modules/main.js
  initModelManagement();
  initSelectionTooltip();
  initPreview();
  initDiffSystem();
  var methodHandlers2 = createMethodHandlers({
    getEditorView,
    searchInternal,
    getProjectId,
    getAllDocsWithContent
  });
  registerMethods(methodHandlers2);
  methodHandlers2.replaceSelection = function(from, to, text) {
    const view = getEditorView();
    if (!view) {
      throw new Error("EditorView not available");
    }
    console.log("[OverleafBridge] replaceSelection called:", {
      from,
      to,
      textLength: text.length
    });
    view.dispatch({
      changes: { from, to, insert: text }
    });
    return { success: true };
  };
  methodHandlers2.showTextActionPreview = function(previewData) {
    startStreamPreview(previewData);
    return { success: true };
  };
  window.addEventListener("message", function(event) {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.type !== "OVERLEAF_BRIDGE_REQUEST") return;
    const requestId = data.requestId;
    const method = data.method;
    const args = data.args || [];
    const response = {
      type: "OVERLEAF_BRIDGE_RESPONSE",
      requestId,
      success: false
    };
    try {
      const handler = methodHandlers2[method];
      if (!handler) {
        throw new Error("Unknown method: " + method);
      }
      const result = handler.apply(null, args);
      if (result && typeof result.then === "function") {
        result.then(function(res) {
          response.success = true;
          response.result = res;
          window.postMessage(response, "*");
        }).catch(function(err) {
          response.success = false;
          response.error = err instanceof Error ? err.message : String(err);
          window.postMessage(response, "*");
        });
        return;
      }
      response.success = true;
      response.result = result;
    } catch (error) {
      response.success = false;
      response.error = error instanceof Error ? error.message : String(error);
    }
    window.postMessage(response, "*");
  });
  console.log("[OverleafBridge] Modular architecture initialized (ESM)");
})();
