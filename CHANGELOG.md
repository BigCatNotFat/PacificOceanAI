# Changelog

All notable changes to PacificOceanAI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.1.3] - 2026-03-10

### Added
- **AI Agent 工具批量操作**：`read_file`、`replace_lines`、`search_replace` 支持多文件批量模式
  - `read_file`：新增 `reads` 数组，可一次调用读取多个文件/多个行范围
  - `replace_lines`：新增 `operations` 数组，可一次调用修改多个文件
  - `search_replace`：新增 `operations` 数组，可一次调用对多个文件执行查找替换
- **DiffAPI 就绪握手**：新增 DIFF_PING/DIFF_PONG 机制，确保新文件打开时 diff UI 稳定初始化

### Changed
- **PromptService**：更新工具使用说明，强调批量模式以降低 API 调用成本
- **CreateFileTool / DeleteFileTool**：改进文件切换与新文件发现逻辑

### Fixed
- **DiffSuggestionService**：修复文件切换时的竞态条件
  - 旧文件的 DIFF_PONG 不再错误地 resolve 正在等待新文件的 waiter
  - 新增 `fileNamesMatch` 辅助函数，正确匹配不同路径格式（如 `main.tex` vs `sections/main.tex`）
- **DiffAPI**：修复新文件首次打开时 DiffAPI 初始化时序问题

---

## [3.0.0] - 2026-03-09

### Added
- Open-sourced under AGPL-3.0 license
- GitHub Actions CI/CD workflows
- Issue and PR templates
- Contributing guidelines and code of conduct
- Image recognition tool support

### Changed
- Major version bump for open-source release
- License changed from MIT to AGPL-3.0
- Removed telemetry service for better privacy
- Adopted Git Flow branching strategy (main + develop)

---

## [2.0.3] - 2026-01-21

### Added
- Multi-model AI support (OpenAI, Anthropic, Gemini, OpenAI-compatible)
- ChatGPT OAuth authentication support
- Function calling and tool system
- Literature search with CrossRef integration
- Real-time streaming responses
- Custom text actions
- Modern sidebar UI with resizable panels

### Changed
- Refactored to service-based architecture with dependency injection
- Improved error handling and user feedback
- Enhanced privacy with local-only data storage

### Fixed
- Codex API request validation for empty input arrays
- Text selection issues in Safari
- Memory leaks in streaming responses

## [2.0.0] - 2026-01-15

### Added
- Complete rewrite with TypeScript and React
- Modular architecture with clean separation of concerns
- Support for multiple AI providers
- Extensible tool system

### Changed
- Migrated from vanilla JS to React
- Improved build system with Vite
- Better state management

### Removed
- Legacy jQuery dependencies
- Old configuration format

## [1.0.0] - 2025-12-01

### Added
- Initial release
- Basic OpenAI integration
- Simple text improvement features
- Sidebar interface

---

## Release Process

1. Update version in `package.json` and `manifest.config.ts`
2. Update CHANGELOG.md with changes
3. Commit changes: `git commit -m "chore: release v2.0.3"`
4. Create tag: `git tag v2.0.3`
5. Push: `git push && git push --tags`
6. Create GitHub release with changelog
