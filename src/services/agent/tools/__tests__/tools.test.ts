/**
 * 工具单元测试示例
 * 
 * 展示如何测试工具实现
 */

import { ReadThirdLineTool } from '../ReadThirdLineTool';
import { InsertAtCursorTool } from '../InsertAtCursorTool';
import type { IToolContext } from '../../../../platform/tools/ITool';

/**
 * Mock EditorService
 */
class MockEditorService {
  private currentFile: string | null = 'test.tex';
  private lines: string[] = [
    'First line',
    'Second line',
    'Third line content',
    'Fourth line'
  ];
  
  async getCurrentFileName(): Promise<string | null> {
    return this.currentFile;
  }
  
  async readLine(lineNumber: number): Promise<string | null> {
    if (lineNumber < 1 || lineNumber > this.lines.length) {
      return null;
    }
    return this.lines[lineNumber - 1];
  }
  
  async insertTextAtCursor(text: string): Promise<void> {
    // Mock implementation
    console.log(`Inserted: ${text}`);
  }
  
  setCurrentFile(fileName: string | null): void {
    this.currentFile = fileName;
  }
  
  setLines(lines: string[]): void {
    this.lines = lines;
  }
}

describe('ReadThirdLineTool', () => {
  let tool: ReadThirdLineTool;
  let mockEditorService: MockEditorService;
  let context: IToolContext;
  
  beforeEach(() => {
    tool = new ReadThirdLineTool();
    mockEditorService = new MockEditorService();
    context = {
      editorService: mockEditorService as any,
      logService: undefined,
      configService: undefined
    };
  });
  
  test('should have correct metadata', () => {
    expect(tool.name).toBe('read_third_line');
    expect(tool.needApproval).toBe(false);
    expect(tool.isReadOnly).toBe(true);
    expect(tool.category).toBe('editor');
  });
  
  test('should read third line successfully', async () => {
    const result = await tool.execute({}, context);
    
    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      fileName: 'test.tex',
      lineNumber: 3,
      content: 'Third line content'
    });
    expect(result.displayMessage).toContain('test.tex');
  });
  
  test('should handle no active file', async () => {
    mockEditorService.setCurrentFile(null);
    
    const result = await tool.execute({}, context);
    
    expect(result.success).toBe(false);
    expect(result.errorMessage).toContain('No active file');
  });
  
  test('should handle file with fewer than 3 lines', async () => {
    mockEditorService.setLines(['Line 1', 'Line 2']);
    
    const result = await tool.execute({}, context);
    
    expect(result.success).toBe(false);
    expect(result.errorMessage).toContain('fewer than 3 lines');
  });
  
  test('should handle missing editorService', async () => {
    const contextWithoutEditor: IToolContext = {
      editorService: undefined as any,
      logService: undefined,
      configService: undefined
    };
    
    const result = await tool.execute({}, contextWithoutEditor);
    
    expect(result.success).toBe(false);
    expect(result.errorMessage).toContain('not available');
  });
});

describe('InsertAtCursorTool', () => {
  let tool: InsertAtCursorTool;
  let mockEditorService: MockEditorService;
  let context: IToolContext;
  
  beforeEach(() => {
    tool = new InsertAtCursorTool();
    mockEditorService = new MockEditorService();
    context = {
      editorService: mockEditorService as any,
      logService: undefined,
      configService: undefined
    };
  });
  
  test('should have correct metadata', () => {
    expect(tool.name).toBe('insert_at_cursor');
    expect(tool.needApproval).toBe(true);
    expect(tool.isReadOnly).toBe(false);
    expect(tool.category).toBe('editor');
  });
  
  test('should insert default text "aabb"', async () => {
    const result = await tool.execute({}, context);
    
    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      fileName: 'test.tex',
      insertedText: 'aabb',
      length: 4
    });
  });
  
  test('should insert custom text', async () => {
    const result = await tool.execute({ text: 'custom text' }, context);
    
    expect(result.success).toBe(true);
    expect(result.data?.insertedText).toBe('custom text');
    expect(result.data?.length).toBe(11);
  });
  
  test('should handle no active file', async () => {
    mockEditorService.setCurrentFile(null);
    
    const result = await tool.execute({}, context);
    
    expect(result.success).toBe(false);
    expect(result.errorMessage).toContain('No active file');
  });
  
  test('should handle missing insertTextAtCursor method', async () => {
    const contextWithLimitedEditor: IToolContext = {
      editorService: {
        getCurrentFileName: () => Promise.resolve('test.tex')
        // insertTextAtCursor 方法不存在
      } as any,
      logService: undefined,
      configService: undefined
    };
    
    const result = await tool.execute({}, contextWithLimitedEditor);
    
    expect(result.success).toBe(false);
    expect(result.errorMessage).toContain('not implemented');
  });
});

/**
 * 集成测试示例
 */
describe('Tool Integration', () => {
  test('should work together in a workflow', async () => {
    const mockEditorService = new MockEditorService();
    const context: IToolContext = {
      editorService: mockEditorService as any,
      logService: undefined,
      configService: undefined
    };
    
    // 1. 读取第三行
    const readTool = new ReadThirdLineTool();
    const readResult = await readTool.execute({}, context);
    
    expect(readResult.success).toBe(true);
    expect(readResult.data?.content).toBe('Third line content');
    
    // 2. 插入文本（需要审批）
    const insertTool = new InsertAtCursorTool();
    
    // 检查是否需要审批
    if (insertTool.needApproval) {
      // 模拟审批流程
      console.log('Waiting for user approval...');
      // 假设用户批准
      const insertResult = await insertTool.execute({ text: 'approved text' }, context);
      expect(insertResult.success).toBe(true);
    }
  });
});

/**
 * 如何运行测试：
 * 
 * 1. 安装测试依赖：
 *    npm install --save-dev jest @types/jest ts-jest
 * 
 * 2. 配置 jest.config.js：
 *    module.exports = {
 *      preset: 'ts-jest',
 *      testEnvironment: 'node',
 *      roots: ['<rootDir>/src'],
 *      testMatch: ['**/__tests__/**/*.test.ts']
 *    };
 * 
 * 3. 运行测试：
 *    npm test
 * 
 * 或者只测试工具：
 *    npm test tools.test.ts
 */
