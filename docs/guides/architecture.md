---
sidebar_position: 3
title: 架构概览
---

# 系统架构

## 整体架构

```
                    ┌─────────────┐
                    │   Browser   │
                    └──────┬──────┘
                           │ HTTP
                    ┌──────▼──────┐
                    │   Gateway   │  (aisphere-gateway)
                    │   :18000    │
                    └──┬───┬───┬──┘
                       │   │   │
              ┌────────┘   │   └────────┐
              ▼            ▼            ▼
       ┌──────────┐ ┌──────────┐ ┌──────────┐
       │   IAM    │ │   Hub    │ │ Runtime  │
       │ :18080   │ │ :18001   │ │  ...     │
       └────┬─────┘ └────┬─────┘ └──────────┘
            │            │
            ▼            ▼
       ┌──────────┐ ┌──────────┐
       │ Casdoor  │ │ SpiceDB  │
       │ (AuthN)  │ │ (AuthZ)  │
       └──────────┘ └──────────┘
```

## 核心组件

### Kernel (github.com/aisphereio/kernel)
规范驱动微服务基础框架。提供 proto-first 开发范式、代码生成、治理中间件和运行时装配。

### IAM (github.com/aisphereio/aisphere-iam)
身份认证和权限管理服务。封装 Casdoor（认证）和 SpiceDB（授权），提供统一 IAM API。

### Hub (github.com/aisphereio/aisphere-hub)
AIHub 业务服务。管理技能目录、版本、包存储和分享工作流。

### Gateway (github.com/aisphereio/aisphere-gateway)
边界网关。读取 route registry，分发请求到后端服务，处理边界准入。

## 开发范式

```text
proto contract
  -> buf-check-aisphere
  -> protoc generators
  -> requestx.Info / accessx / gatewayx / serverx
  -> business service implementation
```

## 数据流示例

### 创建组织

```
Frontend → POST /v1/iam/control-plane/orgs
  → Gateway (route match + 边界准入)
    → IAM ProjectService.CreateOrganization
      → biz.CreateOrganization (验证 + 生成 ID + 投影事件)
        → repo.CreateOrganization (PostgreSQL + outbox)
        → projection.Dispatch (SpiceDB)
      ← Organization
    ← 200 OK
  ← 200 OK
```