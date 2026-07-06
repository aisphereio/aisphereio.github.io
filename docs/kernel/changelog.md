---
title: Changelog
---

# Changelog

## Unreleased

### Breaking

- Removed in-repository `layout/`; generated service templates, generated service Makefile behavior, deploy manifest templates, layout docs and smoke tests now belong to `aisphereio/kernel-layout`.
- Removed in-repository `validation/`; scenario validation should live in independent validation projects, generated service tests or CI temporary generated projects.
- Removed root `buf.gen.deploy.yaml`; generated-service `make deploy` belongs to `kernel-layout`.
- Removed legacy `errors/` package completely.
- Removed orphan `third_party/errors/errors.proto`; no Kernel proto imports it.
- Marked `grpcgatewayx` as not-mainline; use upstream grpc-gateway generator, `protoc-gen-go-gateway` and `gatewayx`.
- Kept `aisphere/access/v1/access.proto` only as a compatibility wrapper; new proto files must import `api/aisphere/access/v1/access.proto`.

### Changed

- `kernel new` now resolves service templates through explicit sources only: `--repo`, `KERNEL_LAYOUT`, then `https://github.com/aisphereio/kernel-layout.git`.
- Kernel root `Makefile` now focuses on Kernel runtime/tooling verification; generated service workflow is documented as `kernel-layout` responsibility.
- Clarified `authz` vs `accessx`: `authz` is the provider contract, while `accessx` is the request-time guard/orchestrator.
- Clarified `authn.IdentityAdmin` vs `iamx.Directory`: `IdentityAdmin` manages external IdP projections, while `Directory` stores Kernel IAM control-plane facts.
- Clarified `resourcex.Grant` vs `authz.Relationship`: grant is the durable control-plane fact, relationship is the query-optimized authorization projection.

### Added

- Added Kernel package boundary index and runtime-boundary documentation.
- Added Windows-first toolchain wrappers: `scripts/tools.cmd`, `scripts/test-cmd.cmd`.
- Added HTTP `ErrorResponse` shape based on stable business `code` and safe public metadata.
- Added gRPC adapter for converting `errorx` to `status.Status` and remote `status.Status` back into `errorx`.
- Added error-code validation helpers: `ValidateCode`, `MustCode`, `MustValidCodes`.
- Added sensitive-key redaction for public metadata.

### Migration notes

- For Kernel repository development, run:

```bash
make tools
make api
make proto-check
make verify
```

- For generated service projects, run the generated service Makefile from `kernel-layout`:

```bash
make tools
make api
make deploy
make proto-check
make verify
```

- Do not import `cmd/*`, `layout/*`, `validation/*` or deprecated paths from business code.
