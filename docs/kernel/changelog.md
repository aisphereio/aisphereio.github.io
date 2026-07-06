---
title: Changelog
---

# Changelog

## Unreleased

### Breaking

- Removed legacy `errors/` package completely.
- Retained `third_party/errors/` proto extension files as the proto annotation contract.
- Retained and converted `cmd/protoc-gen-go-errors/` to generate `errorx` helpers.
- Added Windows-first toolchain wrappers: `scripts/tools.cmd`, `scripts/test-cmd.cmd`.
- Migrated Kernel HTTP/gRPC/middleware/selector/contrib adapters to `errorx`.

### Added

- HTTP `ErrorResponse` shape based on stable business `code` and safe public metadata.
- gRPC adapter for converting `errorx` to `status.Status` and remote `status.Status` back into `errorx`.
- Error-code validation helpers: `ValidateCode`, `MustCode`, `MustValidCodes`.
- Sensitive-key redaction for public metadata.