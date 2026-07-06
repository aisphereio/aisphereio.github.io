---
title: TODO 状态
---

# Kernel 长任务状态

当前目标：把 Kernel 从"能力包集合"收敛成"规范驱动框架"。

## 已完成主线

1. [x] `requestx.Info` 成为请求元信息中心
2. [x] `middleware/requestinfo` 在 server/client 链路统一注入 request info
3. [x] `admissionx` 支持 mutating / validating admission
4. [x] `middleware/autowire` 接入 requestinfo、authn、access、admission、ratelimitx、client policy middleware
5. [x] `middleware/access` 优先读取 `requestx.Info`
6. [x] `protoc-gen-go-authz` 生成 `RequestInfoResolver`
7. [x] `bootx.ValidateGovernance` 支持启动治理校验
8. [x] `serverx` 收敛 HTTP/gRPC transport、系统路由、治理校验和运行时 provider 装配
9. [x] `cmd/protoc-gen-go-gateway` 生成 Gateway Manifest / Binding / Invoker 注册
10. [x] `cmd/protoc-gen-go-kernel` 生成 `<Service>KernelModule()`
11. [x] `cmd/buf-check-aisphere` 执行 proto contract 检查
12. [x] `gatewayx` 支持 Route Manifest、MemoryRegistry、KVStore/EtcdRegistry、Matcher、Dispatcher、InvokerRegistry、gRPC invoker 辅助
13. [x] `ratelimitx` 成为限流唯一主线
14. [x] `dbx + migrationx + dbrepo` 形成数据开发范式
15. [x] README、docs/README、AGENTS、package-status、runtime-api-boundary 改为中文主线
16. [x] `validation/` 从 runtime API 和 CI 默认包图移除

## 下一步

1. [ ] 完成 `serverx.Clients()` 正式 client factory
2. [ ] 用真实 `kernel new -> make api -> make verify` 生成物替换手写等价 demo 代码
3. [ ] 为 Gateway 补 `/gateway/routes` snapshot 系统路由
4. [ ] 为 `gatewayx.EtcdRegistry` 接入真实 etcd clientv3 adapter
5. [ ] 补 IAM demo service 的登录、token relay、service-auth、authz、audit 三段验证
6. [ ] 补 `kernel db migration create/up/status/down` CLI
7. [ ] 补真实 PG/MySQL 集成验证
8. [ ] 补 `kernel db inspect`，从表结构生成 Row/Repo skeleton