---
sidebar_position: 1
---

# Aisphere Kernel

Aisphere Kernel 是 Aisphere 项目的**规范驱动微服务基础框架**。

## 核心理念

```text
proto contract
  -> buf-check-aisphere
  -> protoc generators
  -> requestx.Info / accessx / gatewayx / serverx
  -> business service implementation
```

业务声明契约，Kernel 负责检查、生成、装配、治理和验证。业务项目优先写 proto contract 和领域逻辑，不手写 transport glue、错误协议转换、访问控制、审计、限流或 Gateway 分发。

## 快速开始

```bash
go install github.com/aisphereio/kernel/cmd/kernel@latest
kernel new todo-service
cd todo-service
make tools
make api
make proto-check
make verify
make run
```

最小可运行服务：

```bash
kernel new todo-service --mvp
```

裁剪能力：

```bash
kernel new todo-service --disable iam,gateway,dtmx
```

## Runtime API

业务代码和生成代码可以 import 的主线 runtime 包：

| 包 | 说明 |
|---|---|
| `errorx` | 结构化错误处理 |
| `logx` | 结构化日志 |
| `configx` | 配置管理 |
| `metricsx` | 指标收集 |
| `serverx` | 一键服务装配 |
| `transportx/http` | HTTP transport |
| `transportx/grpc` | gRPC transport |
| `requestx` | 请求元信息中心 |
| `accessx` | 访问控制 guard |
| `authn` | 认证 |
| `authz` | 授权 |
| `auditx` | 审计 |
| `gatewayx` | Gateway runtime |
| `admissionx` | 准入插件链 |
| `ratelimitx` | 限流 |
| `clientpolicyx` | 服务间调用策略 |
| `dbx` | 数据库 |
| `cachex` | 缓存 |
| `objectstorex` | 对象存储 |
| `dtmx` | 分布式事务 |
| `selectorx` | 服务选择 |
| `registry` | 服务注册发现 |
| `encodingx` | 编码 |

## 开发工具

这些是工具，不是 runtime API。业务代码不能 import：

- `cmd/kernel` — 项目脚手架
- `cmd/protoc-gen-go-http` — HTTP 代码生成器
- `cmd/protoc-gen-go-errors` — 错误代码生成器
- `cmd/protoc-gen-go-authz` — 访问控制生成器
- `cmd/protoc-gen-go-gateway` — Gateway 生成器
- `cmd/protoc-gen-go-kernel` — Kernel 元数据生成器
- `cmd/buf-check-aisphere` — 契约检查器

## 验证

```bash
make tools
make api
make test
make test-cmd
make vet
```

完整本地门禁：

```bash
make verify
```

## 文档导航

- [开发规范](/docs/kernel/agents) — AI Agent / 开发者开发规范
- [Roadmap](/docs/kernel/roadmap) — 功能路线图
- [Changelog](/docs/kernel/changelog) — 变更日志
- [贡献指南](/docs/kernel/contributing) — 如何贡献代码
- [安全策略](/docs/kernel/security) — 安全漏洞报告
- [TODO 状态](/docs/kernel/todo-status) — 当前主线状态