---
sidebar_position: 2
title: Hub Agent 规范
---

# Aisphere Hub Agent 规范

## 1. 模块路径

- `go.mod` 必须使用 `module github.com/aisphereio/aisphere-hub`
- 所有内部 import 必须使用 `github.com/aisphereio/aisphere-hub/...`

## 2. Kernel contract 优先

- 新 RPC 必须先写 proto contract
- 对外 RPC 必须同时声明 `google.api.http` 和 `aisphere.access.v1.policy`
- 修改 proto 后必须运行 `make api && make proto-check`

## 3. 访问控制硬规则

- HTTP/gRPC server 必须接入 authn middleware
- `PUBLIC` 只允许登录跳转、授权码交换等明确公开接口
- `AUTHENTICATED` 接口必须经过 authn middleware 验证
- `AUTHORIZED` 接口必须经过 `accessx.Guard`，并写 audit

## 4. AuthN 认证模式

| 模式 | 说明 | 适用场景 |
|---|---|---|
| `casdoor_jwt` | 后端用 `kernel/authn/oidcx` 再验一次 JWT | 当前测试阶段 |
| `gateway_trusted` | 信任 Gateway 注入的 X-Aisphere-* headers | 生产推荐 |

## 5. Service/Biz/Data 分层

- `service` — 只做 DTO 转换和调用 usecase
- `biz` — 用例编排、业务校验、状态机、权限语义和审计事件
- `data` — 持久化和 Kernel provider adapter 调用

## 6. Skill 存储规范

- PostgreSQL 是 control plane
- MinIO/S3 是 data plane
- 文件写入采用 S3-first 或 staging + metadata transaction
- 下载接口使用 ETag/sha256/If-None-Match

## 7. 提交前检查

```bash
go build ./...
go test ./... -count=1 -short
```