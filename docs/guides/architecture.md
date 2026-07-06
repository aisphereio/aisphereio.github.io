---
sidebar_position: 3
title: 架构概览
---

# 系统架构

## 整体架构

```mermaid
graph TB
    subgraph "用户层"
        Browser[浏览器 / Web App]
        CLI[命令行工具]
    end

    subgraph "网关层"
        GW[Gateway<br/>边界网关<br/>:18000]
    end

    subgraph "业务服务层"
        IAM[IAM<br/>身份认证与权限<br/>:18080]
        Hub[Hub<br/>AIHub 业务服务<br/>:18001]
        Git[Git Server<br/>Git 服务]
    end

    subgraph "基础设施层"
        Kernel[Kernel 框架<br/>规范驱动微服务]
        PG[(PostgreSQL<br/>:30080)]
        S3[(MinIO/S3<br/>对象存储)]
        ETCD[(etcd<br/>:30086)]
    end

    subgraph "外部依赖"
        CAS[Casdoor<br/>身份认证<br/>:30082]
        SPDB[SpiceDB<br/>关系授权<br/>:30084]
    end

    Browser -->|HTTP| GW
    CLI -->|HTTP| GW
    GW -->|gRPC| IAM
    GW -->|gRPC| Hub
    GW -->|gRPC| Git
    IAM --> CAS
    IAM --> SPDB
    Hub --> PG
    Hub --> Redis
    Hub --> S3
    IAM --> PG
    Gateway --> ETCD
    IAM --> Kernel
    Hub --> Kernel
    Git --> Kernel
```

## 核心组件

### Kernel (github.com/aisphereio/kernel)
规范驱动微服务基础框架。提供 proto-first 开发范式、代码生成、治理中间件和运行时装配。

```mermaid
flowchart LR
    subgraph "开发流程"
        A[Proto Contract] --> B[buf-check-aisphere]
        B --> C[Protoc Generators]
        C --> D[requestx.Info]
        D --> E[serverx/autowire]
        E --> F[admissionx]
        F --> G[Business Service]
        G --> H[errorx Response]
    end
```

### IAM (github.com/aisphereio/aisphere-iam)
身份认证和权限管理服务。封装 Casdoor（认证）和 SpiceDB（授权），提供统一 IAM API。

```mermaid
flowchart LR
    subgraph "IAM 服务"
        Auth[AuthService<br/>登录/令牌/用户]
        Dir[DirectoryService<br/>用户/组织/组]
        Perm[PermissionService<br/>权限检查/关系管理]
    end

    subgraph "后端"
        CAS[Casdoor]
        SPDB[SpiceDB]
    end

    Auth --> CAS
    Dir --> CAS
    Perm --> SPDB
```

### Hub (github.com/aisphereio/aisphere-hub)
AIHub 业务服务。管理技能目录、版本、包存储和分享工作流。

```mermaid
flowchart LR
    subgraph "Hub 服务"
        Skill[Skill API<br/>CRUD + 版本]
        Draft[Draft Workspace<br/>草稿编辑]
        Share[Share<br/>分享管理]
    end

    subgraph "存储"
        PG[(PostgreSQL<br/>Control Plane)]
        S3[(MinIO/S3<br/>Data Plane)]
    end

    Skill --> PG
    Draft --> S3
    Draft --> PG
    Share --> PG
```

### Gateway (github.com/aisphereio/aisphere-gateway)
边界网关。读取 route registry，分发请求到后端服务，处理边界准入。

```mermaid
flowchart LR
    subgraph "Gateway"
        Route[Route Matcher]
        Access[边界准入<br/>PUBLIC/INTERNAL/AUTHENTICATED]
        Dispatch[Upstream Invoker<br/>gRPC 转发]
    end

    subgraph "路由来源"
        ETCD[(etcd<br/>Route Registry)]
        Manifest[Generated<br/>Route Manifest]
    end

    Manifest --> ETCD
    ETCD --> Route
    Route --> Access
    Access --> Dispatch
```

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

```mermaid
sequenceDiagram
    participant F as Frontend
    participant GW as Gateway
    participant IAM as IAM Service
    participant Biz as Biz Layer
    participant DB as PostgreSQL
    participant SDB as SpiceDB

    F->>GW: POST /v1/iam/control-plane/orgs
    GW->>GW: Route Match + 边界准入
    GW->>IAM: gRPC CreateOrganization
    IAM->>Biz: biz.CreateOrganization
    Biz->>Biz: 验证 + 生成 ID
    Biz->>Biz: 创建投影事件
    Biz->>DB: 事务写入组织 + outbox
    Biz->>Auth: Dispatch 关系写入
    Auth-->>Biz: OK
    Biz-->>IAM: Organization
    IAM-->>GW: 200 OK
    GW-->>F: 200 { id, slug, status }
```

## 端口映射

| Service | HTTP | gRPC | Metrics |
|---------|------|------|---------|
| IAM | `18080` | `19080` | `19180` |
| Gateway | `18000` | `19000` | `19100` |
| Hub | `18001` | `19001` | `19090` |
| Hub Front | `3000` | - | - |