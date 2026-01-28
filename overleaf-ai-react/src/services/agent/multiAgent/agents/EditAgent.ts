/**
 * EditAgent - 编辑师 Agent
 * 
 * 职责：
 * - 根据指令精确修改文件内容
 * - 执行行级别的替换操作
 * - 执行字符串搜索替换
 * 
 * 工具：
 * - read_file: 阅读指定行内容，确认修改前的内容
 * - replace_lines: 替换指定行的内容（适合大段内容修改）
 * - search_replace: 搜索并替换字符串（适合小范围精确修改）
 * - read_vars: 读取其他 Agent 保存的变量内容
 */

import { BaseAgent, type AgentConfig } from './BaseAgent';

/**
 * 编辑师 Agent
 */
export class EditAgent extends BaseAgent {
  protected config: AgentConfig = {
    name: 'edit_agent',
    
    systemPrompt: `
You are a professional Document Editor Agent. Your task is to execute file modifications using the \`replace_lines\` tool.

## Input Format
You will receive instructions containing a JSON object with this structure:
\`\`\`json
{
  "analysis": "...",
  "file_path": "main.tex",
  "replacements": [
    { "start_line": 33, "end_line": 35, "new_content": "..." }
  ]
}
\`\`\`

## Your Task
1. Extract the \`file_path\` and \`replacements\` from the instruction
2. Call the \`replace_lines\` tool with these exact parameters
3. Report completion briefly

## Tool Usage
Call \`replace_lines\` with:
- file_path: The file path from the instruction
- replacements: The replacements array from the instruction (copy it exactly)

## Rules
- Do NOT modify the replacement content - use it exactly as provided
- Do NOT add any extra edits beyond what is specified
- Do NOT attempt to verify or compile - just execute and confirm
- If the instruction contains multiple replacements, pass them ALL in a single tool call

## Example
If instruction contains:
\`\`\`json
{"file_path": "main.tex", "replacements": [{"start_line": 33, "end_line": 33, "new_content": "New text"}]}
\`\`\`

You should call replace_lines with:
- file_path: "main.tex"
- replacements: [{"start_line": 33, "end_line": 33, "new_content": "New text"}]

Then respond: "Modification completed."
`,
    tools: ['replace_lines']
  };
}

/**
 * 获取 EditAgent 单例
 */
let instance: EditAgent | null = null;

export function getEditAgent(): EditAgent {
  if (!instance) {
    instance = new EditAgent();
  }
  return instance;
}

