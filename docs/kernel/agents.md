---
sidebar_position: 2
---

# Kernel Agent 开发规范

本文件是所有 AI Agent / 人类开发者在 Kernel 仓库内写代码时必须遵守的规则。

## 1. 总原则

```text
proto contract
  -> buf-check-aisphere
  -> protoc generators
  -> requestx.Info
  -> serverx/autowire
  -> admissionx
  -> business service
  -> errorx negotiated response
```

业务组件只写领域逻辑。ctx、trace、authn、authz、audit、rate limit、retry、breaker、timeout、error 协议转换由 Kernel 统一提供。

## 2. Runtime API 边界

业务代码和生成代码可以 import 的主线 runtime 包：

```text
errorx logx configx metricsx serverx
transportx/http transportx/grpc
requestx accessx authn authz auditx
gatewayx admissionx ratelimitx clientpolicyx
dbx cachex objectstorex dtmx
selectorx registry encodingx
```

## 3. 目录边界

| 目录 | 职责 | 规则 |
|---|---|---|
| `api/` | proto option、公共契约 | 新 RPC 必须声明 access policy |
| `cmd/protoc-gen-*` | 代码生成器 | 生成 glue code，业务不 import |
| `cmd/buf-check-*` | 契约检查 | 失败即阻断 |
| `requestx/` | 请求元信息中心 | 中间件、审计、限流、鉴权都读 `requestx.Info` |
| `serverx/` | 一键服务装配 | 业务组件必须通过它启动服务 |
| `transportx/` | HTTP/gRPC transport | 新代码使用 transportx |
| `accessx/` | 访问控制 guard | 统一组合 authn/authz/audit |
| `ratelimitx/` | 限流 provider 抽象 | 旧 ratelimit 路径已删除 |
| `clientpolicyx/` | 服务间调用策略 | 下游 timeout/retry/breaker 进入这里 |
| `admissionx/` | 准入插件链 | 跨接口默认值和校验放这里 |
| `gatewayx/` | Gateway runtime | route manifest、registry、matcher、dispatcher |
| `registry/` | 服务注册发现 runtime API | 保持现有包名 |
| `layout/` | 项目模板 | 体现推荐使用方式 |
| `docs/` | 中文规范文档 | 能力变化必须同步文档 |

## 4. 业务开发硬规则

### 4.1 禁止绕过 RequestInfo
禁止业务代码解析 raw HTTP path、raw gRPC full method、operation string。必须使用 `requestx.FromContext(ctx)`。

### 4.2 新接口必须声明 Access Policy
```text
PUBLIC         login/register/token
AUTHENTICATED  /me/logout/refresh
AUTHORIZED     业务资源 CRUD
INTERNAL       服务间调用
SYSTEM         healthz/readyz/metrics/version/debug
```

### 4.3 系统路由由 serverx 管理
业务 proto 不要自己写 `/healthz`、`/readyz`、`/version`、`/metrics`。

### 4.4 跨接口规则进入 admissionx
默认 tenant/project/owner、状态机校验、删除前依赖检查等必须进入 `admissionx`。

### 4.5 服务间调用必须走 Kernel 治理链路
禁止业务直接使用 `grpc.Dial`、裸 `http.Client`、手写 retry loop。

### 4.6 限流必须使用 ratelimitx
旧 `middleware/ratelimit` 和 `internal/ratelimit` 已删除。

### 4.7 Gateway 路由必须由契约驱动
Gateway 不允许手写业务路由表。外部接口必须通过 proto 的 `google.api.http` 和 `aisphere.access.v1.policy` 生成 Route Manifest。

### 4.8 错误必须使用 errorx
业务代码禁止裸返回 `errors.New`、`fmt.Errorf` 或 `panic(err)`。必须使用 `errorx`。

## 5. 提交前检查

```bash
go test ./serverx ./bootx ./requestx ./admissionx ./middleware/autowire ./ratelimitx ./clientpolicyx ./middleware/retry ./middleware/timeout
```