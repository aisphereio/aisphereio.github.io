---
title: Gateway Agent 规范
---

# Aisphere Gateway Agent 规范

## 1. 模块路径

- `go.mod` 必须使用 `module github.com/aisphereio/aisphere-gateway`
- 引用 IAM 必须使用 `github.com/aisphereio/aisphere-iam/api/...`
- 本地联调优先使用 `go.work`

## 2. Gateway 路由来源

- Gateway 不允许长期手写业务路由表
- 业务服务必须通过 proto 的 `google.api.http` 和 `aisphere.access.v1.policy` 生成 Gateway Manifest
- Gateway 只能消费 `gatewayx.RouteRegistry` 中的 Manifest

## 3. 边界职责

- Gateway 负责 route match、PUBLIC/INTERNAL 边界策略、Authorization header 转发和上游分发
- Gateway 不负责最终资源级授权
- IAM/Hub/Runtime 等后端服务必须自己接入 Kernel access middleware
- `INTERNAL` 路由默认不对公网暴露

## 4. 提交前检查

```powershell
make tools-local KERNEL_LOCAL=../kernel
make api
make proto-check
make test
make build
```