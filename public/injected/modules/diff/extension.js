/**
 * Diff 系统 - CodeMirror 扩展
 * 包含 Widget 定义和 StateField 逻辑
 */

// 效果存储，供外部调用
export const diffEffects = {};

// 字段引用
export let diffSuggestionField = null;

/**
 * 创建行级 Widget 类
 * 
 * "先应用"模式：文档已包含新内容，widget 在新内容上方显示旧内容（带删除线）和操作按钮。
 * Accept = 移除装饰（保留新内容）；Reject = 回滚到旧内容。
 */
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
      const oldContent = config.oldContent;
      const onAccept = config.onAccept;
      const onReject = config.onReject;
      
      const container = document.createElement('div');
      container.className = 'diff-suggestion-block';
      container.dataset.suggestionId = id;
      
      const oldContentDiv = document.createElement('div');
      oldContentDiv.className = 'diff-old-content';
      
      const text = document.createElement('span');
      text.className = 'diff-old-text';
      text.textContent = oldContent;
      
      oldContentDiv.appendChild(text);
      
      const buttons = document.createElement('div');
      buttons.className = 'diff-buttons';
      
      const rejectBtn = document.createElement('button');
      rejectBtn.className = 'diff-btn diff-btn-reject';
      rejectBtn.innerHTML = '✕ Undo';
      rejectBtn.type = 'button';
      rejectBtn.addEventListener('mousedown', function(e) { e.preventDefault(); });
      rejectBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        if (onReject) onReject(view, id);
      });
      
      const acceptBtn = document.createElement('button');
      acceptBtn.className = 'diff-btn diff-btn-accept';
      acceptBtn.innerHTML = '✓ Keep';
      acceptBtn.type = 'button';
      acceptBtn.addEventListener('mousedown', function(e) { e.preventDefault(); });
      acceptBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        if (onAccept) onAccept(view, id);
      });
      
      buttons.appendChild(rejectBtn);
      buttons.appendChild(acceptBtn);
      oldContentDiv.appendChild(buttons);
      container.appendChild(oldContentDiv);
      
      return container;
    }
    
    eq(other) {
      return this.config.id === other.config.id &&
             this.config.oldContent === other.config.oldContent;
    }
    
    ignoreEvent(event) {
      return event.type !== 'mousedown' && event.type !== 'mouseup';
    }
  };
}

/**
 * 创建片段级 Widget 类
 */
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
      
      const container = document.createElement('span');
      container.className = 'diff-segment-widget';
      container.dataset.suggestionId = id;
      
      const newText = document.createElement('span');
      newText.className = 'diff-segment-new';
      newText.textContent = newContent;
      container.appendChild(newText);
      
      const buttons = document.createElement('span');
      buttons.className = 'diff-segment-buttons';
      
      const acceptBtn = document.createElement('button');
      acceptBtn.className = 'diff-segment-btn diff-segment-btn-accept';
      acceptBtn.innerHTML = '✓';
      acceptBtn.type = 'button';
      acceptBtn.title = 'Accept';
      acceptBtn.addEventListener('mousedown', function(e) { e.preventDefault(); });
      acceptBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        if (onAccept) onAccept(view, id);
      });
      
      const rejectBtn = document.createElement('button');
      rejectBtn.className = 'diff-segment-btn diff-segment-btn-reject';
      rejectBtn.innerHTML = '✕';
      rejectBtn.type = 'button';
      rejectBtn.title = 'Reject';
      rejectBtn.addEventListener('mousedown', function(e) { e.preventDefault(); });
      rejectBtn.addEventListener('click', function(e) {
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
      return this.config.id === other.config.id &&
             this.config.newContent === other.config.newContent;
    }
    
    ignoreEvent(event) {
      return event.type !== 'mousedown' && event.type !== 'mouseup';
    }
  };
}

/**
 * 创建内联状态 Widget 类
 */
function createInlineStatusWidgetClass(CM) {
  const WidgetType = CM.WidgetType;
  
  return class InlineStatusWidget extends WidgetType {
    constructor(config) {
      super();
      this.config = config;
    }
    
    toDOM(view) {
      const config = this.config;
      
      const spinner = document.createElement('span');
      spinner.className = 'inline-generating-spinner';
      spinner.dataset.inlineStatusId = config.id;
      spinner.title = '生成中... (按 ESC 取消)';
      return spinner;
    }
    
    eq(other) {
      return this.config.id === other.config.id &&
             this.config.state === other.config.state;
    }
    
    ignoreEvent(event) {
      return true;
    }
  };
}

/**
 * 创建扩展
 */
export function createDiffSuggestionExtension(CM) {
  const StateEffect = CM.StateEffect;
  const StateField = CM.StateField;
  const EditorView = CM.EditorView;
  const Decoration = CM.Decoration;
  const DiffSuggestionWidget = createDiffSuggestionWidgetClass(CM);
  const SegmentSuggestionWidget = createSegmentSuggestionWidgetClass(CM);
  const InlineStatusWidget = createInlineStatusWidgetClass(CM);
  
  // 定义 Effects
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
  
  // 暴露 effects 到 window (兼容性)
  window._diffSuggestionEffects = diffEffects;
  
  diffSuggestionField = StateField.define({
    create: function() {
      return { 
        suggestions: new Map(),
        segments: new Map(),
        inlineStatus: new Map()
      };
    },
    update: function(value, tr) {
      const suggestions = new Map(value.suggestions);
      const segments = new Map(value.segments);
      const inlineStatus = new Map(value.inlineStatus);
      
      if (tr.docChanged) {
        // 更新行级建议位置
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
        
        // 更新片段级建议位置
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
        
        // 更新内联状态位置
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
      
      // 处理 effects
      for (const effect of tr.effects) {
        if (effect.is(diffEffects.addDiffSuggestionEffect)) {
          suggestions.set(effect.value.id, effect.value);
        } else if (effect.is(diffEffects.removeDiffSuggestionEffect)) {
          suggestions.delete(effect.value);
        } else if (effect.is(diffEffects.clearDiffSuggestionsEffect)) {
          suggestions.clear();
        }
        else if (effect.is(diffEffects.addSegmentSuggestionEffect)) {
          segments.set(effect.value.id, effect.value);
        } else if (effect.is(diffEffects.removeSegmentSuggestionEffect)) {
          segments.delete(effect.value);
        } else if (effect.is(diffEffects.clearSegmentSuggestionsEffect)) {
          segments.clear();
        }
        else if (effect.is(diffEffects.addInlineStatusEffect)) {
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
        
        // 行级建议装饰（先应用模式：文档已是新内容，widget 在上方显示旧内容）
        for (const entry of suggestions) {
          const id = entry[0];
          const config = entry[1];
          try {
            const lineStart = state.doc.lineAt(config.lineFrom);
            const lineEnd = state.doc.lineAt(config.lineTo);
            
            // 新内容行标记为绿色高亮
            for (let i = lineStart.number; i <= lineEnd.number; i++) {
              const line = state.doc.line(i);
              decorations.push(
                Decoration.line({ class: 'diff-line-added' }).range(line.from)
              );
            }
            
            // 旧内容 widget 显示在新内容块的上方（side: -1）
            decorations.push(
              Decoration.widget({
                widget: new DiffSuggestionWidget(config),
                block: true,
                side: -1
              }).range(lineStart.from)
            );
          } catch (e) {
            console.error('[DiffAPI] 创建行级装饰失败:', e);
          }
        }
        
        // 片段级建议装饰
        for (const entry of segments) {
          const id = entry[0];
          const config = entry[1];
          try {
            if (config.startOffset < config.endOffset) {
              decorations.push(
                Decoration.mark({ class: 'diff-segment-deleted' }).range(config.startOffset, config.endOffset)
              );
            }
            
            decorations.push(
              Decoration.widget({
                widget: new SegmentSuggestionWidget(config),
                side: 1
              }).range(config.widgetPos)
            );
          } catch (e) {
            console.error('[DiffAPI] 创建片段级装饰失败:', e);
          }
        }
        
        // 内联状态装饰
        for (const entry of inlineStatus) {
          const id = entry[0];
          const config = entry[1];
          try {
            if (config.state === 'generating') {
              if (config.from < config.to) {
                decorations.push(
                  Decoration.mark({ class: 'inline-generating-text' }).range(config.from, config.to)
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
            console.error('[InlineStatus] 创建内联状态装饰失败:', e);
          }
        }
        
        return Decoration.set(decorations, true);
      });
    }
  });
  
  // 暴露 field 到 window
  window._diffSuggestionField = diffSuggestionField;
  
  return diffSuggestionField;
}

