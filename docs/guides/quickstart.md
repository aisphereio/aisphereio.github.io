---
sidebar_position: 4
title: 快速开始
---

# 快速开始

## 前置要求

- Go 1.22+
- Node.js 18+
- PostgreSQL 15+
- Redis 6+
- etcd (可选)
- Casdoor (可选)
- SpiceDB (可选)

## 安装 Kernel CLI

```bash
go install github.com/aisphereio/kernel/cmd/kernel@latest
```

## 创建新服务

```bash
kernel new my-service
cd my-service
make tools
make api
make proto-check
make verify
make run
```

## 启动完整栈

参考 [本地开发环境](/docs/guides/local-stack) 文档启动所有服务。

## 验证

```bash
# 健康检查
curl http://127.0.0.1:18000/healthz

# 查看 Gateway 路由
curl http://127.0.0.1:18000/v1/gateway/routes
```