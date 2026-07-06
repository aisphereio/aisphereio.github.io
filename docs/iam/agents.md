---
sidebar_position: 3
title: IAM Agent 规范
---

# Aisphere IAM Agent 规范

本仓库是 Kernel 体系下的 IAM 服务仓库，不是 Kernel layout 模板仓库。

## 1. 模块路径

- `go.mod` 必须使用 `module github.com/aisphereio/aisphere-iam`
- 所有内部 import 必须使用 `github.com/aisphereio/aisphere-iam/...`
- 本地多仓联调用 `go.work`

## 2. Kernel contract 优先

- 新 RPC 必须先写 proto contract
- 对外 RPC 必须同时声明 `google.api.http` 和 `aisphere.access.v1.policy`
- 修改 proto 后必须运行 `make api && make proto-check`

## 3. 访问控制硬规则

- HTTP/gRPC server 必须接入 `requestinfo + authn + access` middleware
- `PUBLIC` 只允许登录跳转、授权码交换等明确公开接口
- `INTERNAL` 接口不能暴露到公网入口
- `AUTHORIZED` 接口必须经过 `accessx.Guard`，并写 audit

## 4. Gateway 注册

- IAM 可以在启动时把 generated Gateway Manifest 注册到 `gatewayx.RouteRegistry`
- Route Manifest 必须来自 generated code，不允许手写外部 HTTP path 清单

## 5. 提交前检查

```bash
make tools-local KERNEL_LOCAL=../kernel
make api
make proto-check
make test
make build
```