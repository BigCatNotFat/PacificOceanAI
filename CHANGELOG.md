# Changelog

All notable changes to PacificOceanAI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
