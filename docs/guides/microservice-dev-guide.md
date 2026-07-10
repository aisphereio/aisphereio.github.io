---
sidebar_position: 8
title: 微服务开发指导手册
---

# Aisphere 微服务开发指导手册

> 版本: v1.0 | 最后更新: 2026-07-10

---

## 目录

1. [架构总览](#1-架构总览)
2. [认证与授权体系](#2-认证与授权体系)
3. [Kernel 框架核心概念](#3-kernel-框架核心概念)
4. [Protobuf 驱动开发](#4-protobuf-驱动开发)
5. [服务开发规范](#5-服务开发规范)
6. [前端开发规范](#6-前端开发规范)
7. [部署架构](#7-部署架构)
8. [CI/CD 流程](#8-cicd-流程)
9. [Envoy Gateway 配置](#9-envoy-gateway-配置)
10. [附录](#10-附录)

---

## 1. 架构总览

### 1.1 整体架构

```mermaid
graph TB
    subgraph "用户层"
        Browser[用户浏览器]
    end

    subgraph "网关层"
        EG[Envoy Gateway<br/>HTTPS :30723 / HTTP :30936]
    end

    subgraph "业务服务层"
        IAM[aisphere-iam<br/>身份认证与权限<br/>:18080 / :19080]
        Hub[aisphere-hub<br/>核心业务 API<br/>:18001 / :19001]
        GW[aisphere-gateway<br/>API 网关<br/>:18000 / :19000]
        Git[aisphere-git-server<br/>Git 服务]
    end

    subgraph "前端层"
        HubFront[aisphere-hub-front<br/>Hub 前端 SPA<br/>:3000]
        IAMFront[aisphere-iam-front<br/>IAM 管理控制台<br/>:3001]
    end

    subgraph "基础设施"
        PG[(PostgreSQL<br/>:30080)]
        CAS[Casdoor<br/>OIDC 身份提供商<br/>:30082]
        SPDB[SpiceDB<br/>关系授权引擎<br/>:30084]
        Redis[(Redis<br/>:30085)]
        ETCD[(etcd<br/>路由注册表<br/>:30086)]
        S3[(MinIO<br/>对象存储<br/>:30089)]
    end

    Browser -->|HTTPS| EG
    IAMFront -->|HTTPS| EG
    HubFront -->|HTTPS| EG
    EG -->|HTTPRoute| Hub
    EG -->|HTTPRoute| IAM
    EG -->|HTTPRoute| IAMFront
    EG -->|HTTPRoute| HubFront
    IAM --> CAS[Casdoor SDK]
    IAM --> SPDB
    Hub --> PG
    Hub --> Redis
    Hub --> S3
    IAM --> PG
    IAM --> Redis
    GW --> ETCD
```

### 1.2 核心设计原则

| 原则 | 说明 |
|------|------|
| **Envoy Gateway 是唯一入口** | 所有外部流量必须经过 Envoy Gateway，没有其他 Ingress Controller |
| **OIDC 在 Gateway 层完成** | Casdoor 登录流程由 Envoy Gateway 处理，后端服务信任 Gateway 注入的 headers |
| **Protobuf 驱动** | 所有 API 定义、访问策略、部署配置均由 proto 文件生成 |
| **Kernel 框架统一** | 所有微服务基于 `github.com/aisphereio/kernel` 框架开发 |
| **前后端分离** | 前端直连 Envoy Gateway API，无代理层 |
| **SpiceDB 做最终授权** | 所有写操作经过 SpiceDB 权限检查 |

### 1.3 服务清单

| 服务 | 目录 | HTTP 端口 | gRPC 端口 | 认证模式 | 说明 |
|------|------|-----------|-----------|----------|------|
| aisphere-hub | `aisphere-hub/` | 18001 | 19001 | `gateway_trusted` | 核心业务 API |
| aisphere-iam | `aisphere-iam/` | 18080 | 19080 | `hybrid` | 身份与访问管理 |
| aisphere-gateway | `aisphere-gateway/` | 18000 | 19000 | `casdoor_jwt` | API 网关（路由分发） |
| aisphere-git-server | `aisphere-git-server/` | - | - | - | Git 服务 |
| aisphere-hub-front | `aisphere-hub-front/` | 3000 | - | `gateway_oidc` | Hub 前端 SPA |
| aisphere-iam-front | `aisphere-iam-front/` | 3001 | - | `gateway_oidc` | IAM 管理控制台 |

---

## 2. 认证与授权体系

### 2.1 认证模式 (AuthN)

Kernel 框架支持以下认证模式，通过 `security.authn.mode` 配置：

| 模式 | 配置值 | 说明 | 适用场景 |
|------|--------|------|----------|
| **Gateway 信任模式**（默认） | `gateway_trusted` | 信任 Envoy Gateway 注入的 `x-aisphere-*` headers，不重复验证 JWT | **所有部署在 Envoy Gateway 后的后端服务** |
| **Casdoor JWT 模式** | `casdoor_jwt` | 通过 Casdoor OIDC Discovery + JWKS 本地验证 Bearer JWT | 网关层、直接暴露的服务 |
| **混合模式** | `hybrid` | 先尝试 Bearer JWT，失败后回退到 Gateway 信任 headers | 同时支持 Gateway 和直接调用的服务 |
| **禁用** | `disabled` | 不进行认证 | 仅用于开发调试 |

> **默认推荐：`gateway_trusted`**。所有后端服务应默认使用此模式，由 Envoy Gateway 统一处理 OIDC 认证和 JWT 验证，后端服务只信任 Gateway 注入的 headers。

### 2.2 完整认证流程

#### 2.2.1 用户登录流程（前端 → Envoy Gateway → Casdoor）

```mermaid
sequenceDiagram
    participant B as 浏览器
    participant EG as Envoy Gateway
    participant CAS as Casdoor
    participant SVC as 后端服务

    B->>EG: GET /v1/iam/me
    EG->>EG: 检查 session cookie
    EG-->>B: 302 重定向到 Casdoor
    B->>CAS: GET /login/oauth/authorize?...
    CAS->>CAS: 验证用户凭据
    CAS-->>B: 302 回调到 Gateway
    B->>EG: GET /v1/iam/oauth2/callback
    EG->>EG: 处理 OAuth2 回调
    EG->>EG: 设置 session cookie
    Note over EG: 注入 x-aisphere-* headers
    EG->>SVC: 转发请求 + 可信 headers
    SVC->>SVC: 从 headers 恢复 Principal
    SVC-->>EG: 200 { user info }
    EG-->>B: 200 { user info }
```

#### 2.2.2 Envoy Gateway 认证处理流程

```
1. 客户端请求到达 Envoy Gateway
2. Gateway 匹配 HTTPRoute，找到对应的 SecurityPolicy
3. Gateway 检查 session cookie
   - 有有效 session → 跳过 OIDC，直接进入 JWT 验证
   - 无 session → 302 重定向到 Casdoor OAuth2 登录
4. Gateway 通过 JWKS 本地验证 JWT（无需每次远程调用）
   - 验证 issuer、audience、exp、nbf、iat、alg
   - 使用 Casdoor OIDC Discovery 获取公钥
   - 公钥缓存 10 分钟
5. Gateway 剥离所有入站 x-aisphere-* headers（防伪造）
   - 通过 ClientTrafficPolicy 在 Gateway 级别统一剥离
6. Gateway 通过 claimToHeaders 注入可信身份 headers
   - sub → x-aisphere-external-sub
   - email → x-aisphere-external-email
   - name → x-aisphere-external-name
   - preferred_username → x-aisphere-external-username
7. Gateway 转发到后端服务
8. 后端服务通过 Kernel 的 PrincipalFromTrustedHeaders() 恢复 Principal
```

### 2.3 多 Casdoor 应用配置（多前端共享同一 Envoy Gateway）

#### 2.3.1 架构原理

Aisphere 的多个前端（Hub 前端、IAM 管理控制台等）都通过**同一个 Envoy Gateway**（`api.weagent.cc:30723`）进行认证。实现方式是：

- **一个 Envoy Gateway**，对外暴露统一入口
- **多个 SecurityPolicy**，每个绑定到不同的 HTTPRoute
- **每个 SecurityPolicy 使用不同的 Casdoor 应用**（不同 clientID、不同 redirectURL）
- **每个 SecurityPolicy 可以配置不同的 claimToHeaders**

```
Casdoor (OIDC Provider)
  ├── 应用 "aisphere" (client_id: bbdcfc272e2b990cb923)
  │     └── 用途: Hub API 认证
  ├── 应用 "aisphere-iam" (client_id: 869aff97ab0408cbbd1c)
  │     └── 用途: IAM API 认证
  └── 应用 "aisphere-gitserver" (client_id: ec15766f6cb98b908433)
        └── 用途: Git 服务器认证

Envoy Gateway (api.weagent.cc:30723)
  │
  ├── SecurityPolicy: hub-oidc-policy
  │     clientID: bbdcfc272e2b990cb923
  │     redirectURL: /v1/authn/exchange
  │     logoutPath: /v1/authn/logout
  │     claimToHeaders: sub→x-aisphere-external-sub, ...
  │     Target: HTTPRoute "hub-api-route"
  │       → /v1/authn/*, /v1/authz/*, /v1/skills/*, ...
  │       → Backend: aisphere-hub:18001
  │
  ├── SecurityPolicy: iam-oidc
  │     clientID: 869aff97ab0408cbbd1c
  │     redirectURL: /v1/iam/oauth2/callback
  │     logoutPath: /v1/iam/logout
  │     claimToHeaders: sub→x-aisphere-external-sub, ...
  │     Target: HTTPRoute "iam-http"
  │       → /v1/iam/*
  │       → Backend: aisphere-iam:18080
  │
  └── 公开路由（无 SecurityPolicy）
        HTTPRoute "iam-health-http" → /healthz → aisphere-iam:18080
        HTTPRoute "casdoor-public-http" → / → casdoor:8000
```

#### 2.3.2 多 Casdoor 应用配置示例

**Hub API 路由的 SecurityPolicy：**

```yaml
apiVersion: gateway.envoyproxy.io/v1alpha1
kind: SecurityPolicy
metadata:
  name: hub-oidc-policy
  namespace: aisphere-system
spec:
  targetRefs:
    - group: gateway.networking.k8s.io
      kind: HTTPRoute
      name: hub-api-route
  oidc:
    provider:
      issuer: "https://casdoor.weagent.cc:30723"
    clientID: "bbdcfc272e2b990cb923"          # Casdoor 应用 "aisphere"
    clientSecret:
      name: casdoor-hub-client-secret
    redirectURL: "https://api.weagent.cc:30723/v1/authn/exchange"  # Hub 的回调地址
    logoutPath: "/v1/authn/logout"
    scopes:
      - openid
      - profile
      - email
    refreshToken: true
    forwardAccessToken: true
    passThroughAuthHeader: true
  jwt:
    providers:
      - name: casdoor
        issuer: "https://casdoor.weagent.cc:30723"
        audiences:
          - "bbdcb6c272e2b990cb923"
        remoteJWKS:
          uri: "https://casdoor.weagent.cc:30723/.well-known/jwks"
        claimToHeaders:
          - claim: sub
            header: x-aisphere-external-sub
          - claim: email
            header: x-aisphere-external-email
          - claim: name
            header: x-aisphere-external-name
          - claim: preferred_username
            header: x-aisphere-external-username
```

**IAM API 配置的 Security Policy：**

```yaml
apiVersion: gateway.envoyproxy.io/v1alpha1
kind: SecurityPolicy
metadata:
  name: iam-oidc
  namespace: aisphere
spec:
  targetRefs:
    - group: gateway.networking.k8s.io
      kind: HTTPRoute
      name: iam-http
  oidc:
    provider:
      issuer: "https://casdoor.weagent.cc:30723"
    clientID: "869aff97ab0408cbbd1c"          # Casdoor 应用 "aisphere-iam"
    clientSecret:
      secretRef: casdoor-oidc-client-secret
    redirectURL: "https://api.weagent.cc:30723/v1/iam/oauth2/callback"  # IAM 的回调地址
    logoutPath: "/v1/iam/logout"
    scopes:
      - openid
      - profile
      - email
    refreshToken: true
    forwardAccessToken: true
  jwt:
    providers:
      - name: casdoor
        issuer: "https://casdoor.weagent.cc:30723"
        audiences:
          - "869aff97ab0408cbbd1c"
        remoteJWKS:
          uri: "https://casdoor.weagent.cc:30723/.well-known/jwks"
        claimToHeaders:
          - claim: sub
            header: x-aisphere-external-sub
          - claim: email
            header: x-aisphere-external-email
          - claim: name
            header: x-aisphere-external-name
          - claim: preferred_username
            header: x-aisphere-external-username
```

#### 2.3.3 关键配置要点

| 配置项 | Hub API | IAM API | 说明 |
|--------|---------|---------|------|
| `clientID` | `bbdcfc272e2b990cb923` | `869aff97ab0408cbbd1c` | 每个 Casdoor 应用有唯一 clientID |
| `redirectURL` | `/v1/authn/exchange` | `/v1/iam/oauth2/callback` | 每个应用有独立的回调地址 |
| `logoutPath` | `/v1/authn/logout` | `/v1/iam/logout` | 每个应用有独立的登出路径 |
| `claimToHeaders` | 相同 | 相同 | JWT claim 到 header 的映射可以复用 |
| `targetRefs` | `hub-api-route` | `iam-http` | 每个 SecurityPolicy 绑定到不同的 HTTPRoute |

#### 2.3.4 前端如何选择 Casdoor 应用

前端不直接选择 Casdoor 应用。流程如下：

1. 前端访问某个 API 路径（如 Hub 前端访问 `/v1/authn/me`）
2. Envoy Gateway 根据 HTTPRoute 匹配规则找到对应的路由
3. 该路由绑定的 SecurityPolicy 决定了使用哪个 Casdoor 应用
4. 用户被重定向到 Casdoor 对应应用的登录页
5. 登录成功后，回调到该应用配置的 redirectURL

**前端配置示例：**

```typescript
// Hub 前端 (.env)
NEXT_PUBLIC_API_URL=https://api.weagent.cc:30723
// 访问 /v1/authn/me → 匹配 hub-api-route → hub-oidc-policy → Casdoor "aisphere" 应用

// IAM 前端 (.env)
NEXT_PUBLIC_API_URL=https://api.weagent.cc:30723
// 访问 /v1/iam/me → 匹配 iam-http → iam-oidc → Casdoor "aisphere-iam" 应用
```

两个前端指向**同一个 API 地址**，但访问不同的路径前缀，Envoy Gateway 根据路径匹配到不同的 SecurityPolicy，从而使用不同的 Casdoor 应用。

### 2.4 JWT Claim 到 Header 映射

#### 2.4.1 Envoy Gateway 配置

在 SecurityPolicy 的 `jwt.providers[].claimToHeaders` 中配置：

```yaml
jwt:
  providers:
    - name: casdoor
      issuer: "https://casdoor.weagent.cc:30723"
      audiences:
        - "bbdcfc272e2b990cb923"
      remoteJWKS:
        uri: "https://casdoor.weagent.cc:30723/.well-known/jwks"
      claimToHeaders:
        - claim: sub
          header: x-aisphere-external-sub
        - claim: email
          header: x-aisphere-external-email
        - claim: name
          header: x-aisphere-external-name
        - claim: preferred_username
          header: x-aisphere-external-username
```

#### 2.4.2 完整 Header 映射表

| JWT Claim | HTTP Header | Principal 字段 | 说明 |
|-----------|-------------|----------------|------|
| `sub` | `x-aisphere-external-sub` | `ExternalID` | 用户唯一标识（主键） |
| `email` | `x-aisphere-external-email` | `Email` | 邮箱 |
| `name` | `x-aisphere-external-name` | `Name` / `Username` | 显示名称 |
| `preferred_username` | `x-aisphere-external-username` | `Username` | 用户名 |
| `iss` | `x-aisphere-external-issuer` | `Issuer` | 签发者 |
| `owner` | `x-aisphere-external-owner` | `OrgID` | 组织 ID |
| `scope` | `x-aisphere-external-scope` | `Scopes` | 权限范围 |

#### 2.4.3 Kernel 端 Principal 恢复

后端服务通过 Kernel 的 `authn.PrincipalFromTrustedHeaders()` 函数从 headers 恢复 `Principal`：

```go
// kernel/authn/trusted_headers.go

// 主入口：先检查显式可信 headers，再回退到 Gateway claim headers
func PrincipalFromTrustedHeaders(headers map[string]string) (Principal, bool) {
    if strings.EqualFold(headerValue(headers, TrustedHeaderVerified), "true") {
        return principalFromExplicitTrustedHeaders(headers)
    }
    return principalFromGatewayClaimHeaders(headers)
}

// 从 Gateway claim headers 恢复 Principal
func principalFromGatewayClaimHeaders(headers map[string]string) (Principal, bool) {
    // 优先级: principal > user_id > external_id > external_sub
    subjectID := firstNonEmpty(principalID, userID, externalID, externalSub)
    if subjectID == "" {
        return Principal{}, false
    }
    // ... 从各个 x-aisphere-external-* headers 恢复字段
}
```

恢复后的 `Principal` 结构体：

```go
type Principal struct {
    SubjectID      string   // 用户唯一标识
    Username       string   // 用户名
    Name           string   // 显示名称
    Email          string   // 邮箱
    OrganizationID string   // 组织 ID
    Groups         []string // 所属组
    Roles          []string // 角色
    Scopes         []string // 权限范围
    Source         string   // 认证来源: "gateway"
}
```

### 2.5 防伪造机制

Envoy Gateway 通过 `ClientTrafficPolicy` 在请求处理的最早期剥离所有客户端可能伪造的 headers：

```yaml
apiVersion: gateway.envoyproxy.io/v1alpha1
kind: ClientTrafficPolicy
metadata:
  name: aisphere-sanitize-headers
  namespace: aisphere-system
spec:
  targetRef:
    group: gateway.networking.k8s.io
    kind: Gateway
    name: aisphere-gateway
  headers:
    earlyRequestHeaders:
      remove:
        - x-aisphere-external-sub
        - x-aisphere-external-email
        - x-aisphere-external-name
        - x-aisphere-external-username
        - x-aisphere-principal
        - x-aisphere-user-id
        - x-aisphere-org-id
        - x-aisphere-project-id
        - x-aisphere-roles
        - x-aisphere-authz-decision-id
        - x-aisphere-internal-jwt
        - x-internal-jwt
```

**安全流程：**
1. `ClientTrafficPolicy` 在 Gateway 层剥离所有 `x-aisphere-*` headers
2. Envoy Gateway 验证 JWT/OIDC
3. `SecurityPolicy` 的 `claimToHeaders` 注入可信的 `x-aisphere-external-*` headers
4. 后端服务信任这些 headers（因为不可信来源的 headers 已在第 1 步被剥离）

### 2.6 授权体系 (Authz)

#### 2.6.1 SpiceDB 关系模型

授权引擎使用 SpiceDB（Google Zanzibar 实现），基于关系图谱进行权限检查。

**核心概念：**
- **资源 (Resource)**：被访问的对象（如 project, skill, group）
- **主体 (Subject)**：发起访问的用户或服务
- **关系 (Relationship)**：主体与资源之间的关系（如 owner, member, viewer）
- **权限 (Permission)**：基于关系推导出的操作权限（如 read, write, manage）

#### 2.6.2 权限层级结构

```mermaid
graph TB
    subgraph "Zone 层级"
        Z[zone:aisphere]
        ZO[owner / admin]
        ZVU[user_viewer / user_manager]
        ZVG[group_viewer / group_manager]
        ZP[permission_admin]
        Z --> ZO
        Z --> ZVU
        Z --> ZVG
        Z --> ZP
    end

    subgraph "Group 层级"
        G[group]
        GO[owner / manager / viewer / member]
        GP[parent（上级组）]
        GZ[zone（所属组织）]
        G --> GO
        G --> GP
        G --> GZ
    end

    subgraph "Project 层级"
        P[project]
        PO[owner / admin / developer / operator / viewer]
        PP[parent(organization)]
        P --> PO
        P --> PP
    end

    subgraph "Skill 层级"
        S[skill]
        SO[owner / editor / reviewer / viewer]
        SP[parent(skill_space)]
        S --> SO
        S --> SP
    end
```

#### 2.6.3 访问策略注解

每个 RPC 方法通过 proto 注解声明访问策略：

```protobuf
rpc CreateSkill(CreateSkillRequest) returns (CreateSkillResponse) {
  option (aisphere.access.v1.policy) = {
    exposure: AUTHORIZED
    authz: {
      action: "create"
      resource: "aihub:skill:*"
      audience: "user"
      mode: CHECK_ONLY
    }
    audit: {
      event: "skill.created"
      risk: MEDIUM
    }
    rate_limit: {
      qps: 100
      burst: 200
    }
  };
}
```

**Exposure 级别：**

| 级别 | 值 | 说明 |
|------|-----|------|
| PUBLIC | 0 | 公开接口，无需认证 |
| AUTHENTICATED | 1 | 需要认证，无需额外授权 |
| AUTHORIZED | 2 | 需要认证 + 授权检查 |
| INTERNAL | 3 | 仅限内部服务间调用 |
| SYSTEM | 4 | 仅限系统级调用 |

### 2.7 后端服务认证配置示例

```yaml
security:
  authn:
    enabled: true
    mode: gateway_trusted        # 默认模式：信任 Envoy Gateway 注入的 headers
    provider: casdoor            # 认证提供商
    cache_ttl_ns: 300000000000   # 认证缓存 TTL (5分钟)
    oidc:
      provider: casdoor
      issuer: http://casdoor:8000
      discovery_url: http://casdoor:8000/.well-known/openid-configuration
      jwks_url: http://casdoor:8000/.well-known/jwks
      audience: [bbdcfc272e2b990cb923]
      allowed_owners: [aisphere]
      allowed_algs: [RS256, RS512, ES256, ES512]
      jwks_cache_ttl_ns: 600000000000  # JWKS 缓存 TTL (10分钟)
      clock_skew_ns: 60000000000       # 时钟偏差容忍 (60秒)
    casdoor:
      endpoint: http://casdoor:8000
      organization_name: aisphere
      application_name: aisphere
      client_id: "bbdcfc272e2b990cb923"
      client_secret: "c4d351406d40251b267624328e50e8a1f7352a65"
  internal_call:
    enabled: true
    header: X-Aisphere-Internal-Token
    token: "aisphere-internal-token-2026"
  authz:
    enabled: true
    provider: spicedb
    dev_allow_all: false
    spicedb:
      endpoint: spicedb:50051
      token: "keykeykey"
      transport: grpc
      insecure: true
```

---

## 3. Kernel 框架核心概念

### 3.1 应用生命周期

```go
// 创建应用
app := kernel.New(
    kernel.Name("my-service"),
    kernel.Version("1.0.0"),
    kernel.Server(httpServer, grpcServer),
    kernel.Registrar(etcdRegistrar),
)

// 启动应用（阻塞，直到收到退出信号）
app.Run()
```

### 3.2 配置加载

使用 `configx` 包，支持文件 + 环境变量：

```go
import "github.com/aisphereio/kernel/configx"

var bc conf.Bootstrap
if err := configx.LoadConfig(&bc, configx.File(path)); err != nil {
    panic(err)
}
```

### 3.3 中间件管道

Kernel 的自动装配中间件管道顺序：

**服务端：**
```
custom before → timeout → ctx inject → request info → metadata
→ authn → rate limit → authz/audit → admission → custom after
```

**客户端：**
```
custom before → request info → metadata → timeout
→ rate limit → circuit breaker → retry → custom after
```

### 3.4 上下文注入 (contextx)

业务代码通过 `contextx` 包获取请求上下文信息：

```go
import "github.com/aispherego/kernel/contextx"

// 获取认证主体
principal := contextx.PrincipalFromContext(ctx)
// principal.SubjectID, principal.Username, principal.Email, principal.OrganizationID

// 获取请求 ID
requestID := contextx.RequestIDFromContext(ctx)

// 获取 Trace ID
traceID := contextx.TraceIDFromContext(ctx)

// 获取租户 ID
tenantID := contextx.TenantFromContext(ctx)

// 获取 Logger
logger := contextx.LoggerFromContext(ctx)
```

### 3.5 认证主体 (Principal)

认证通过后，Kernel 将 `authn.Principal` 注入到 context 中：

```go
type Principal struct {
    SubjectID      string   // 用户唯一标识
    Username       string   // 用户名
    Name           string   // 显示名称
    Email          string   // 邮箱
    OrganizationID string   // 组织 ID
    Groups         []string // 所属组
    Roles          []string // 角色
    Scopes         []string // 权限范围
    Source         string   // 认证来源 (gateway / jwt / internal)
}
```

### 3.6 服务注册与路由发布

服务启动时自动将路由注册到 etcd：

```go
// 在 main.go 中
serverx.PublishGatewayRoutes(app, routeRegistry, manifests...)
```

路由注册前缀：`/aisphere/kernel/routes/{env}`

---

## 4. Protobuf 驱动开发

### 4.1 项目结构规范

```
service-name/
├── api/                    # Protobuf 定义 + 生成代码
│   └── service/v1/
│       ├── service.proto   # 服务定义
│       └── service.pb.go   # 生成代码
├── cmd/
│   └── service/
│       └── main.go         # 入口
├── configs/
│   ├── config.yaml         # 默认配置
│   └── config.local.yaml   # 本地覆盖
├── internal/
│   ├── biz/                # 业务逻辑层
│   ├── conf/               # 配置结构体
│   ├── data/               # 数据访问层
│   ├── server/             # 服务端设置
│   └── service/            # 服务实现层
├── deploy/                 # K8s 部署文件
├── migrations/             # 数据库迁移
├── Dockerfile
├── Makefile
├── go.mod
└── buf.yaml               # Buf 配置
```

### 4.2 Proto 文件规范

```protobuf
syntax = "proto3";

package service.v1;

import "aisphere/access/v1/access.proto";
import "aisphere/options/v1/authz.proto";

service MyService {
  // 每个 RPC 必须声明访问策略
  rpc GetResource(GetResourceRequest) returns (GetResourceResponse) {
    option (aisphere.access.v1.policy) = {
      exposure: AUTHORIZED
      authz: {
        action: "read"
        resource: "myapp:resource:{name}"
        audience: "user"
        mode: CHECK_ONLY
      }
      audit: {
        event: "resource.read"
        risk_level: LOW
      }
    };
  }
}

message GetResourceRequest {
  string name = 1;
}

message GetResourceResponse {
  string id = 1;
  string name = 2;
}
```

### 4.3 访问策略注解规范

每个 RPC 方法必须包含 `aisphere.access.v1.policy` 注解：

```protobuf
option (aisphere.access.v1.policy) = {
  // 暴露级别（必填）
  exposure: AUTHORIZED

  // 授权配置（exposure 为 AUTHORIZED 时必填）
  authz: {
    action: "create"           // 操作名称
    resource: "app:res:*"      // 资源模式（* 为通配符）
    audience: "user"           // 受众
    mode: CHECK_ONLY           // 检查模式
  }

  // 审计配置（可选）
  audit: {
    event: "resource.create"   // 事件名称
    risk_level: MEDIUM         // 风险级别
  }

  // 限流配置（可选）
  rate_limit: {
    qps: 100
    burst: 200
  }

  // Gateway 发布配置（可选）
  gateway: {
    publish: true
    methods: ["GET", "POST"]
  }
};
```

### 4.4 代码生成

```bash
# 安装工具
make tools

# 生成 API 代码
make api

# 生成部署配置
make deploy

# 检查 proto 合规性
make proto-check
```

### 4.5 服务实现

```go
// internal/service/myservice.go
type MyService struct {
    v1.UnimplementedMyServiceServer
    uc *biz.MyUseCase
}

func (s *MyService) MyMethod(ctx context.Context, req *v1.MyRequest) (*v1.MyResponse, error) {
    // 从 context 获取认证主体
    principal := contextx.PrincipalFromContext(ctx)
    if principal == nil {
        return nil, errorx.Unauthenticated("missing principal")
    }

    // 业务逻辑
    result, err := s.uc.DoSomething(ctx, principal, req)
    if err != nil {
        return nil, err
    }
    return result, nil
}
```

---

## 5. 服务开发规范

### 5.1 新建服务步骤

1. **创建项目目录**：参考 `kernel-layout/` 模板
2. **定义 Proto 文件**：在 `api/` 目录下定义服务接口
3. **生成代码**：运行 `make tools && make api && make deploy`
4. **实现业务逻辑**：在 `internal/biz/` 中实现
5. **实现数据访问**：在 `internal/data/` 中实现
6. **实现服务层**：在 `internal/service/` 中实现
7. **配置服务端**：在 `internal/server/` 中配置 HTTP/gRPC 服务器
8. **配置认证**：在 `configs/config.yaml` 中配置认证模式
9. **编写 Dockerfile**：多阶段构建
10. **编写 K8s 部署文件**：Deployment + Service + ConfigMap
11. **配置 Gateway 路由**：HTTPRoute + SecurityPolicy
12. **配置 CI/CD**：GitHub Actions 推送到阿里云 ACR

### 5.2 配置规范

```yaml
service:
  name: myapp-core          # 服务名称
  version: dev              # 版本
  env: local                # 环境

server:
  http:
    addr: 0.0.0.0:18000     # HTTP 端口
    timeout_ns: 5000000000  # 超时 (5s)
    cors:
      enabled: true
      allowed_origins:
        - http://localhost:3000
      allowed_methods: [GET, POST, PUT, PATCH, DELETE, OPTIONS]
      allowed_headers: [Authorization, Content-Type, X-Request-ID, X-Trace-ID]
      exposed_headers: [X-Request-ID]
      allow_credentials: true
      max_age_ns: 3600000000000  # 1 小时
  grpc:
    addr: 0.0.0.0:19000     # gRPC 端口
    timeout_ns: 5000000000

log:
  service_name: myapp-core
  level: info
  format: console
  redact:
    enabled: true
    keys: [password, secret, token, access_key, secret_key, client_secret]
    value: "***"
  access_log:
    enabled: true
    skip_paths: [/healthz, /readyz, /metrics]
    slow_threshold: 1000000000  # 1s

data:
  database:
    enabled: true
    config:
      driver: postgres
      dsn: "postgres://user:pass@host:5432/db?sslmode=disable"
      max_open_conns: 20
      max_idle_conns: 10
      conn_max_lifetime_ns: 1800000000000  # 30 分钟
      slow_query_threshold_ns: 200000000   # 200ms
  cache:
    enabled: false
  object_store:
    enabled: false

security:
  authn:
    enabled: true
    mode: gateway_trusted    # 部署在 Envoy 后使用此模式
    provider: casdoor
    # ... OIDC 配置

metrics:
  enabled: true
  addr: 0.0.0.0:19100
  path: /metrics
  pprof: false
  runtime: true
```

### 5.3 错误处理规范

使用 Kernel 的 `errorx` 包定义业务错误：

```go
import "github.com/aispherego/kernel/errorx"

// 定义错误码
var (
    ErrNotFound     = errorx.New(404, "RESOURCE_NOT_FOUND", "resource not found")
    ErrUnauthorized = errorx.New(401, "UNAUTHORIZED", "unauthorized")
    ErrForbidden    = errorx.New(403, "FORBIDDEN", "permission denied")
    ErrInvalidArg   = errorx.New(400, "INVALID_ARGUMENT", "invalid argument")
)

// 使用
if err != nil {
    return nil, ErrNotFound
}
```

### 5.4 日志规范

```go
import "github.com/aispherego/kernel/logx"

// 获取带上下文的 Logger
logger := logx.FromContext(ctx)
logger.Info("operation completed",
    "resource_id", resourceID,
    "duration_ms", duration.Milliseconds(),
)

// 结构化字段
logger.Warn("slow query detected",
    "query", query,
    "duration_ms", duration.Milliseconds(),
    "threshold_ms", threshold,
)
```

### 5.5 健康检查

每个服务必须提供 `/healthz` 和 `/readyz` 端点：

```go
srv.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
    writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
})

srv.HandleFunc("/readyz", func(w http.ResponseWriter, r *http.Request) {
    if resources == nil {
        writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "not_ready"})
        return
    }
    writeJSON(w, http.StatusOK, map[string]string{"status": "ready"})
})
```

---

## 6. 前端开发规范

### 6.1 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Next.js | 16 (preview) | 框架 |
| React | 19 | UI 库 |
| TypeScript | 5.x | 类型系统 |
| Tailwind CSS | 4 | 样式 |
| TanStack React Query | 5 | 数据获取 |
| Zustand | 5 | 状态管理 |
| Framer Motion | 12 | 动画 |
| shadcn/ui | - | UI 组件库 |
| Zod | 4 | 验证 |

### 6.2 项目结构

```
frontend/
├── src/
│   ├── app/
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── layout/       # 布局组件
│   │   ├── pages/        # 页面组件
│   │   ├── shared/       # 共享组件
│   │   └── ui/           # shadcn/ui 组件
│   ├── hooks/
│   │   ├── use-auth.ts   # 认证 hooks
│   │   └── use-*.ts      # 业务 hooks
│   ├── lib/
│   │   ├── api/          # API 客户端
│   │   └── utils.ts      # 工具函数
│   └── types/
├── public/
├── next.config.ts
├── package.json
├── Dockerfile
└── .env
```

### 6.3 认证模式

前端使用 `gateway_oidc` 模式，由 Envoy Gateway 处理 OIDC 流程：

```typescript
// .env
NEXT_PUBLIC_API_URL=https://api.weagent.cc:30723
NEXT_PUBLIC_AUTH_MODE=gateway_oidc
NEXT_PUBLIC_GATEWAY_LOGIN_URL=https://api.weagent.cc:30723/v1/iam/ui/login
NEXT_PUBLIC_GATEWAY_LOGOUT_URL=https://api.weagent.cc:30723/v1/iam/logout
```

**登录流程：**
1. 前端调用 `GET /v1/iam/me` 检查会话
2. 未认证 → 重定向到 Gateway OIDC 登录 URL
3. Gateway 处理 Casdoor OAuth2 流程
4. 回调到前端 → 再次调用 `/me` 确认会话
5. 认证成功 → 渲染主界面

### 6.4 API 调用规范

```typescript
// lib/api/client.ts
const API_URL = process.env.NEXT_PUBLIC_API_URL

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: 'include',  // 携带 cookie
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  })

  if (!res.ok) {
    throw new ApiError(res.status, await res.text())
  }

  return res.json()
}
```

### 6.5 本地开发

```bash
# 启动前端（本地开发）
cd aisphere-iam-front
npm run dev -- --port 3001

# 前端直连 Envoy Gateway API
# 无需 Next.js rewrites 代理层
```

---

## 7. 部署架构

### 7.1 部署策略

| 组件 | 部署位置 | 部署方式 | 说明 |
|------|----------|----------|------|
| **前端** | 本地开发机 | `npm run dev` | 快速开发调试 |
| **后端** | K8s 集群 | GitHub Actions → 阿里云 ACR → kubectl | 生产部署 |
| **基础设施** | K8s 集群 | Helm / kubectl apply | PostgreSQL, Redis, etcd 等 |

### 7.2 基础设施组件

| 服务 | 集群地址 | NodePort | 用途 |
|------|----------|----------|------|
| PostgreSQL | `apps-postgre:5432` | 30080 | 共享数据库 |
| Casdoor | `casdoor:8000` | 30082 | OIDC 身份提供商 |
| SpiceDB gRPC | `spicedb:50051` | 30084 | 关系授权引擎 |
| Redis | `redis-standalone:6379` | 30085 | 缓存 |
| etcd | `etcd-client:2379` | 30086 | 路由注册表 |
| MinIO S3 | `minio:9000` | 30089 | 对象存储 |

### 7.3 K8s 部署文件规范

```yaml
# deploy/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp-core
  namespace: aisphere
spec:
  replicas: 1
  selector:
    matchLabels:
      app: myapp-core
  template:
    metadata:
      labels:
        app: myapp-core
    spec:
      serviceAccountName: myapp-core
      containers:
      - name: server
        image: registry.cn-beijing.aliyuncs.com/ainfracn/myapp-core:latest
        ports:
        - containerPort: 18000  # HTTP
        - containerPort: 19000  # gRPC
        livenessProbe:
          httpGet:
            path: /healthz
            port: 18000
          initialDelaySeconds: 15
          periodSeconds: 20
        readinessProbe:
          httpGet:
            path: /healthz
            port: 18000
          initialDelaySeconds: 5
          periodSeconds: 10
        resources:
          requests:
            cpu: 100m
            memory: 128Mi
          limits:
            cpu: 500m
            memory: 512Mi
```

```yaml
# deploy/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: myapp-core
  namespace: aisphere
spec:
  type: ClusterIP
  selector:
    app: myapp-core
  ports:
  - name: http
    port: 18000
    targetPort: 18000
  - name: grpc
    port: 19000
    targetPort: 19000
```

### 7.4 Dockerfile 规范

```dockerfile
# 多阶段构建
FROM golang:1.25.8-alpine AS builder
RUN apk add --no-cache make git
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN make tools && make api && make deploy
RUN CGO_ENABLED=0 go build -o server ./cmd/server

FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata
RUN adduser -D app
COPY --from=builder /app/server /app/
COPY --from=builder /app/configs /app/configs
USER app
WORKDIR /app
EXPOSE 18000 19000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --spider http://localhost:18000/healthz
CMD ["./server", "-conf", "./configs/config.yaml"]
```

---

## 8. CI/CD

### 8.1 GitHub Actions 工作流

```yaml
# .github/workflows/docker-acr.yml
name: Build and Push Image

on:
  push:
    branches: [main, feat/**]
    tags: [v*]
  pull_request:
    branches: [main, feat/**]
  workflow_dispatch:
    inputs:
      image_tag:
        description: 'Custom image tag'
        required: false

jobs:
  docker:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4

    - name: Login to Aliyun ACR
      uses: docker/login-action@v3
      with:
        registry: registry.cn-beijing.aliyuncs.com
        username: ${{ secrets.ALIYUN_REGISTRY_USERNAME }}
        password: ${{ secrets.ALIYUN_REGISTRY_PASSWORD }}

    - name: Build and push
      uses: docker/build-push-action@v6
      with:
        context: .
        push: ${{ github.event_name != 'pull_request' }}
        tags: |
          registry.cn-beijing.aliyuncs.com/ainfracn/myapp-core:latest
          registry.cn-beijing.aliyuncs.com/ainfracn/myapp-core:${{ github.sha }}
        cache-from: type=gha
        cache-to: type=gha,mode=max
```

### 8.2 部署到 K8s

```bash
# 1. 构建并推送镜像（GitHub Actions 自动完成）
git push origin main

# 2. SSH 到服务器
ssh root@36.137.200.194

# 3. 更新部署
kubectl set image deployment/myapp-core -n aisphere \
  myapp-core=registry.cn-beijing.aliyuncs.com/ainfracn/myapp-core:latest

# 4. 验证
kubectl rollout status deployment/myapp-core -n aisphere
```

---

## 9. Envoy Gateway 配置

### 9.1 GatewayClass 和 Gateway

```yaml
# GatewayClass
apiVersion: gateway.networking.k8s.io/v1
kind: GatewayClass
metadata:
  name: aisphere-gateway-class
spec:
  controllerName: gateway.envoyproxy.io/gatewayclass-controller
---
# Gateway
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: aisphere-gateway
  namespace: aisphere-system
spec:
  gatewayClassName: aisphere-gateway-class
  listeners:
  - name: http
    port: 80
    protocol: HTTP
  - name: https
    port: 443
    protocol: HTTPS
    tls:
      mode: Terminate
      certificateRef:
        name: weagent-cc-tls
    hostname: "*.weagent.cc"
```

### 9.2 HTTPRoute 规范

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: myapp-core-route
  namespace: aisphere
spec:
  parentRefs:
  - name: aisphere-gateway
    namespace: aisphere-system
  hostnames: ["api.weagent.cc"]
  rules:
  - matches:
    - path:
        type: PathPrefix
        value: /v1/myapp-core/
    backendRefs:
    - name: myapp-core
      port: 18000
```

### 9.3 SecurityPolicy 规范

#### 9.3.1 新建服务的 SecurityPolicy 模板

```yaml
apiVersion: gateway.envoyproxy.io/v1alpha1
kind: SecurityPolicy
metadata:
  name: myapp-core-oidc
  namespace: aisphere
spec:
  targetRefs:
    - group: gateway.networking.k8s.io
      kind: HTTPRoute
      name: myapp-core-route
  oidc:
    provider:
      issuer: "https://casdoor.weagent.cc:30723"
    # 在 Casdoor 中为你的服务创建独立应用，获取对应的 clientID
    clientID: "YOUR_CASDOOR_APP_CLIENT_ID"
    clientSecret:
      name: casdoor-client-secret
    # 每个服务有独立的回调地址
    redirectURL: "https://api.weagent.cc:30723/v1/myapp/callback"
    logoutPath: "/v1/myapp/logout"
    scopes:
      - openid
      - profile
      - email
    refreshToken: true
    forwardAccessToken: true
    passThroughAuthHeader: true
  jwt:
    providers:
      - name: casdoor
        issuer: "https://casdoor.weagent.cc:30723"
        audiences:
          - "YOUR_CASDOOR_APP_CLIENT_ID"
        remoteJWKS:
          uri: "https://casdoor.weagent.cc:30723/.well-known/jwks"
        claimToHeaders:
          - claim: sub
            header: x-aisphere-external-sub
          - claim: email
            header: x-aisphere-external-email
          - claim: name
            header: x-aisphere-external-name
          - claim: preferred_username
            header: x-aisphere-external-username
```

#### 9.3.2 多 Casdoor 应用配置示例

当多个服务共享同一个 Envoy Gateway 时，每个服务使用独立的 SecurityPolicy：

```yaml
# --- Hub API 的 SecurityPolicy ---
apiVersion: gateway.envoyproxy.io/v1alpha1
kind: SecurityPolicy
metadata:
  name: hub-oidc-policy
  namespace: aisphere-system
spec:
  targetRefs:
    - group: gateway.networking.k8s.io
      kind: HTTPRoute
      name: hub-api-route
  oidc:
    provider:
      issuer: "https://casdoor.weagent.cc:30723"
    clientID: "bbdcfc272e2b990cb923"          # Casdoor 应用 "aisphere"
    clientSecret:
      name: casdoor-hub-client-secret
    redirectURL: "https://api.weagent.cc:30723/v1/authn/exchange"
    logoutPath: "/v1/authn/logout"
    scopes: [openid, profile, email]
    refreshToken: true
    forwardAccessToken: true
  jwt:
    providers:
      - name: casdoor
        issuer: "https://casdoor.weagent.cc:30723"
        audiences: ["bbdcfc272e2b990cb923"]
        remoteJWKS:
          uri: "https://casdoor.weagent.cc:30723/.well-known/jwks"
        claimToHeaders:
          - claim: sub → header: x-aisphere-external-sub
          - claim: email → header: x-aisphere-external-email
          - claim: name → header: x-aisphere-external-name
          - claim: preferred_username → header: x-aisphere-external-username
---
# IAM API 的 SecurityPolicy
apiVersion: gateway.envoyproxy.io/v1alpha1
kind: SecurityPolicy
metadata:
  name: iam-oidc
  namespace: aisphere
spec:
  targetRefs:
    - group: gateway.networking.k8s.io
      kind: HTTPRoute
      name: iam-http
  oidc:
    provider:
      issuer: "https://casdoor.weagent.cc:30723"
    clientID: "869aff97ab0408cbbd1c"          # Casdoor 应用 "aisphere-iam"
    clientSecret:
      secretRef: casdoor-oidc-client-secret
    redirectURL: "https://api.weagent.cc:30723/v1/iam/oauth2/callback"
    logoutPath: "/v1/iam/logout"
    scopes: [openid, profile, email]
    refreshToken: true
    forwardAccessToken: true
  jwt:
    providers:
      - name: casdoor
        issuer: "https://casdoor.weagent.cc:30723"
        audiences: ["869aff97ab0408cbbd1c"]
        remoteJWKS:
          uri: "https://casdoor.weagent.cc:30723/.well-known/jwks"
        claimToHeaders:
          - claim: sub → header: x-aisphere-external-sub
          - claim: email → header: x-aisphere-external-email
          - claim: name → header: x-aisphere-external-name
          - claim: preferred_username → header: x-aisphere-external-username
```

### 9.4 防伪造：ClientTrafficPolicy

在 Gateway 级别剥离所有客户端可能伪造的 `x-aisphere-*` headers：

```yaml
apiVersion: gateway.envoyproxy.io/v1alpha1
kind: ClientTrafficPolicy
metadata:
  name: aisphere-sanitize-headers
  namespace: aisphere-system
spec:
  targetRef:
    group: gateway.networking.k8s.io
    kind: Gateway
    name: aisphere-gateway
  headers:
    earlyRequestHeaders:
      remove:
        - x-aisphere-external-sub
        - x-aisphere-external-email
        - x-aisphere-external-name
        - x-aisphere-external-username
        - x-aisphere-principal
        - x-aisphere-user-id
        - x-aisphere-org-id
        - x-aisphere-project-id
        - x-aisphere-roles
        - x-aisphere-authz-decision-id
        - x-aisphere-internal-jwt
        - x-internal-jwt
```

### 9.5 CORS 配置

```yaml
apiVersion: gateway.envoyproxy.io/v1alpha1
kind: SecurityPolicy
metadata:
  name: cors-policy
  namespace: aisphere-system
spec:
  targetRef:
    - group: gateway.networking.k8s.io
      kind: Gateway
      name: aisphere-gateway
  cors:
    allowOrigins:
      - http://localhost:3000
      - http://localhost:3001
      - https://hub.weagent.cc:30723
      - https://api.weagent.cc:30723
    allowMethods: [GET, POST, PUT, PATCH, DELETE, OPTIONS]
    allowHeaders: [Authorization, Content-Type, X-Request-ID, X-Trace-ID, Traceparent, Tracestate]
    exposeHeaders: [X-Request-ID, Content-Length]
    maxAge: 3600s
```

### 9.6 JWT Claim 到 Header 映射

Envoy Gateway 的 `claimToHeaders` 配置将 JWT claims 注入到请求 headers：

| JWT Claim | HTTP Header | Principal 字段 | 说明 |
|-----------|-------------|----------------|------|
| `sub` | `x-aisphere-external-sub` | `ExternalID` | 用户唯一标识（主键） |
| `email` | `x-aisphere-external-email` | `Email` | 邮箱 |
| `name` | `x-aisphere-external-name` | `Name` / `Username` | 显示名称 |
| `preferred_username` | `x-aisphere-external-username` | `Username` | 用户名 |

后端服务通过 `gateway_trusted` 模式从这些 headers 恢复 `Principal`。

---

## 10. 附录

### 10.1 常用命令

```bash
# 本地开发
make run                    # 启动服务
make build                  # 编译
make test                   # 运行测试
make tools                  # 安装工具
make api                    # 生成 proto 代码
make deploy                 # 生成部署配置
make proto-check            # 检查 proto 合规性
make docker                 # 构建 Docker 镜像

# 数据库迁移
make migrate-up             # 执行迁移
make migrate-down           # 回滚迁移

# 部署
kubectl apply -k deploy/    # 部署到 K8s
kubectl rollout status deployment/myapp-core -n aisphere
```

### 10.2 端口分配规范

| 端口范围 | 用途 |
|----------|------|
| 18000-18099 | 服务 HTTP 端口 |
| 19000-19099 | 服务 gRPC 端口 |
| 19100-19199 | 服务 Metrics 端口 |
| 30000-30999 | K8s NodePort 映射 |

### 10.3 环境变量规范

| 变量 | 说明 | 示例 |
|------|------|------|
| `NEXT_PUBLIC_API_URL` | 前端 API 地址 | `https://api.weagent.cc:30723` |
| `NEXT_PUBLIC_AUTH_MODE` | 认证模式 | `gateway_oidc` |
| `NEXT_PUBLIC_GATEWAY_LOGIN_URL` | Gateway 登录 URL | `https://api.weagent.cc:30723/v1/iam/ui/login` |
| `NEXT_PUBLIC_GATEWAY_LOGOUT_URL` | Gateway 登出 URL | `https://api.weagent.cc:30723/v1/iam/logout` |

### 10.4 关键文件索引

| 文件 | 用途 |
|------|------|
| `kernel/app.go` | 应用生命周期管理 |
| `kernel/authn/oidcx/` | OIDC/JWKS 认证实现 |
| `kernel/contextx/` | 上下文注入 |
| `kernel/middleware/autowire/` | 自动装配中间件管道 |
| `kernel/securityx/` | 安全配置和运行时 |
| `kernel/gatewayx/` | Gateway 路由分发 |
| `kernel/serverx/` | 服务装配和注册 |
| `deploy-architecture.md` | 完整部署架构说明 |
| `aisphere-iam/internal/server/access.go` | IAM 访问控制配置示例 |
| `aisphere-hub/deploy/gateway/` | Envoy Gateway 配置示例 |

### 10.5 常见问题

**Q: 为什么后端默认使用 `gateway_trusted` 模式？**
A: 因为 Envoy Gateway 已经完成了 OIDC 认证和 JWT 验证，后端无需重复验证。Gateway 通过 `ClientTrafficPolicy` 剥离了客户端伪造的 headers，再通过 `claimToHeaders` 注入可信的 `x-aisphere-external-*` headers，后端服务可以信任这些 headers。

**Q: 多个前端如何共享同一个 Envoy Gateway？**
A: 每个前端访问不同的 API 路径前缀（如 Hub 前端访问 `/v1/authn/*`，IAM 前端访问 `/v1/iam/*`），Envoy Gateway 根据 HTTPRoute 匹配到不同的 SecurityPolicy，每个 SecurityPolicy 使用不同的 Casdoor 应用（不同 clientID、不同 redirectURL）。

**Q: 如何添加新的服务并配置独立的 Casdoor 应用？**
A: 1) 在 Casdoor 中创建新应用，获取 clientID 和 clientSecret 2) 创建 HTTPRoute 指向新服务 3) 创建 SecurityPolicy 绑定到该 HTTPRoute，使用新的 clientID 和 redirectURL 4) 后端服务配置 `gateway_trusted` 模式

**Q: 如何添加新的 API 接口？**
A: 1) 在 proto 文件中定义 RPC 和访问策略 2) 运行 `make api` 生成代码 3) 实现服务接口 4) 运行 `make deploy` 生成 Gateway 配置

**Q: 前端如何与后端通信？**
A: 前端直连 Envoy Gateway API（`https://api.weagent.cc:30723`），通过 `credentials: 'include'` 携带 session cookie。不同的前端指向同一个 API 地址，但访问不同的路径前缀。

**Q: 如何调试认证问题？**
A: 1) 检查 Envoy Gateway 日志 2) 检查 Casdoor 日志 3) 检查后端服务日志 4) 确认 `ClientTrafficPolicy` 是否正确剥离了入站 headers 5) 确认 `claimToHeaders` 是否正确注入了 `x-aisphere-external-*` headers 6) 确认后端服务配置了 `gateway_trusted` 模式