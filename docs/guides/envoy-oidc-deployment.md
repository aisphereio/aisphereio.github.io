---
sidebar_position: 9
title: Envoy Gateway OIDC 部署配置指南
description: Aisphere 平台基于 Envoy Gateway + Casdoor OIDC 的完整部署配置指南，包含常见问题排查。
---

# Envoy Gateway OIDC 部署配置指南

本文档记录 Aisphere 平台基于 Envoy Gateway + Casdoor OIDC 的完整部署配置流程，以及踩过的坑和解决方案。

## 一、架构概览

```text
用户浏览器
  ↓ HTTPS :30723
Envoy Gateway (envoy-gateway-system)
  ↓ HTTPRoute
聚合路由 (iam-console)
  ├── /          → 前端 SPA (aisphere-iam-frontend:3000)
  └── /v1/iam/*  → 后端 API (aisphere-iam:18080)
  ↓
OIDC SecurityPolicy (iam-console-oidc)
  ├── 未登录 → 302 跳转到 Casdoor
  ├── 已登录 → 验证 session，注入 x-aisphere-* headers
  └── JWT claimToHeaders 投影身份
```

## 2. 核心配置

### 2.1 Gateway

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: aisphere-gateway
  namespace: aisphere
spec:
  gatewayClassName: aisphere-gateway-class
  listeners:
    - name: http
      port: 80
      protocol: HTTP
      allowedRoutes:
        namespaces:
          from: Same
    - name: https
      port: 443
      protocol: HTTPS
      hostname: "*.weagent.cc"
      tls:
        certificateRefs:
          - name: weagent-cc-tls
      allowedRoutes:
        namespaces:
          from: Same
```

> **注意**：`allowedRoutes.namespaces.from: Same` 表示只接受同 namespace 的 HTTPRoute。如果 Gateway 和 HTTPRoute 在不同 namespace，需要配置 ReferenceGrant。

### 2.2 聚合 HTTPRoute

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: iam-console
  namespace: aisphere
spec:
  hostnames:
    - iam.weagent.cc
  parentRefs:
    - group: gateway.networking.k8s.io
      kind: Gateway
      name: aisphere-gateway
      namespace: aisphere
      sectionName: https
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /
      backendRefs:
        - name: aisphere-iam-frontend
          port: 3000
    - matches:
        - path:
            type: PathPrefix
            value: /v1/iam
      backendRefs:
        - name: aisphere-iam
          port: 18080
```

> **关键**：使用聚合 Route 覆盖前端和后端 API，确保整个域名都受 OIDC 保护。如果只保护前端 Route，后端 API Route 没有 SecurityPolicy 绑定，请求会绕过 OIDC。

### 2.3 OIDC SecurityPolicy

```yaml
apiVersion: gateway.envoyproxy.io/v1alpha1
kind: SecurityPolicy
metadata:
  name: iam-console-oidc
  namespace: aisphere
spec:
  targetRefs:
    - group: gateway.networking.k8s.io
      kind: HTTPRoute
      name: iam-console
  oidc:
    provider:
      issuer: https://casdoor.weagent.cc:30723
      # authorizationEndpoint 是浏览器跳转地址，必须用外部可访问的 URL
      authorizationEndpoint: https://casdoor.weagent.cc:30723/login/oauth/authorize
      # tokenEndpoint 是 Envoy 服务端发起的，可以用集群内地址
      tokenEndpoint: http://casdoor.aisphere:8000/api/login/oauth/access_token
    clientID: "869aff97ab0408cbbd1c"  # Casdoor 中的 clientId UUID
    clientSecret:
      name: casdoor-iam-oidc
    redirectURL: https://iam.weagent.cc:30723/oauth2/callback
    logoutPath: /logout
    scopes:
      - openid
      - profile
      - email
    refreshToken: true
    forwardAccessToken: true
    passThroughAuthHeader: true
    cookieNames:
      accessToken: Aisphere-IAM-AccessToken
      idToken: Aisphere-IAM-IDToken
  jwt:
    providers:
      - name: casdoor
        issuer: https://casdoor.weagent.cc:30723
        audiences:
          - 869aff97ab0408cbbd1c
        remoteJWKS:
          uri: http://casdoor.aisphere:8000/.well-known/jwks
        extractFrom:
          cookies:
            - Aisphere-IAM-AccessToken
          headers:
            - name: Authorization
              valuePrefix: "Bearer "
        claimToHeaders:
          - claim: sub
            header: x-aisphere-external-sub
          - claim: email
            header: x-aisphere-external-email
          - claim: name
            header: x-aisphere-external-name
          - claim: preferred_username
            header: x-aisphere-external-username
          - claim: iss
            header: x-aisphere-external-issuer
          - claim: owner
            header: x-aisphere-external-owner
          - claim: id
            header: x-aisphere-external-id
          - claim: displayName
            header: x-aisphere-external-display-name
          - claim: scope
            header: x-aisphere-external-scope
```

## 3. 可信身份头清洗策略

为防止客户端伪造身份头绕过 `gateway_trusted` 信任边界，必须在 Envoy Gateway 处理请求的最早期剥离所有 `x-aisphere-*` 头。Envoy 完成 OIDC/JWT 验证后再通过 `claimToHeaders` 注入可信值。

```yaml
apiVersion: gateway.envoyproxy.io/v1alpha1
kind: ClientTrafficPolicy
metadata:
  name: aisphere-sanitize-headers
  namespace: aisphere
spec:
  targetRef:
    group: gateway.networking.k8s.io
    kind: Gateway
    name: aisphere-gateway
  headers:
    earlyRequestHeaders:
      remove:
        - x-aisphere-auth-verified
        - x-aisphere-subject
        - x-aisphere-external-sub
        - x-aisphere-external-id
        - x-aisphere-external-issuer
        - x-aisphere-external-email
        - x-aisphere-external-name
        - x-aisphere-external-display-name
        - x-aisphere-external-username
        - x-aisphere-external-phone
        - x-aisphere-external-owner
        - x-aisphere-external-scope
        - x-aisphere-principal
        - x-aisphere-user-id
        - x-aisphere-org-id
        - x-aisphere-project-id
        - x-aisphere-roles
        - x-aisphere-groups
        - x-aisphere-scopes
        - x-aisphere-authz-decision-id
        - x-aisphere-internal-token
        - x-aisphere-internal-jwt
        - x-internal-jwt
```

> **安全原则**：`gateway_trusted` 信任的不是一个 Header，而是"经过 Envoy 的受控网络路径"。Header 清洗是这条信任链的第一道防线。该策略必须应用于所有外部 Gateway listener，不能被 public route 跳过。

## 4. 完整请求链路

### 3.1 未登录用户访问

```text
浏览器 → https://iam.weagent.cc:30723/
  ↓
Envoy Gateway 匹配 HTTPRoute iam-console
  ↓
OIDC SecurityPolicy 检查 session cookie
  ↓ 无 session
设置 OAuth2 Nonce/CodeVerifier Cookie
  ↓
302 跳转到 Casdoor:
  https://casdoor.weagent.cc:30723/login/oauth/authorize?client_id=xxx&redirect_uri=https://iam.weagent.cc:30723/oauth2/callback&response_type=code&scope=openid%20profile%20email
  ↓
用户输入账号密码登录 Casdoor
  ↓
Casdoor 回调到 Envoy:
  https://iam.weagent.cc:30723/oauth2/callback?code=xxx&state=yyy
  ↓
Envoy 完成 code exchange，设置 session cookie
  ↓
重定向回原始 URL: https://iam.weagent.cc:30723/
```

### 3.2 已登录用户访问

```text
浏览器 → https://iam.weagent.cc:30723/
  ↓
Envoy 验证 session cookie
  ↓
JWT provider 从 cookie/header 提取 token
  ↓
claimToHeaders 注入 x-aisphere-external-* headers
  ↓
转发到前端 SPA (aisphere-iam-frontend:3000)
  ↓
前端加载，调用 /v1/iam/me
  ↓
Envoy 再次验证 session，注入 headers
  ↓
转发到 IAM 后端 (aisphere-iam:18080)
  ↓
Kernel middleware 从 headers 恢复 authn.Principal
  ↓
返回用户信息，前端显示主界面
```

## 4. 前端配置

### 4.1 构建变量

前端使用 `NEXT_PUBLIC_*` 环境变量，这些变量在 `npm run build` 时编译进 JS bundle，运行时修改无效。

```dockerfile
# Dockerfile
ARG NEXT_PUBLIC_IAM_URL=""
ARG NEXT_PUBLIC_GATEWAY_LOGIN_URL=""
ARG NEXT_PUBLIC_GATEWAY_LOGOUT_URL=""
```

**推荐值**：全部留空（使用同源相对路径）。这样前端 API 请求自动使用当前页面的 origin。

### 4.2 GitHub Actions 变量

如果使用 GitHub Actions 构建，需要检查 Repository Variables：

```bash
gh variable list | grep NEXT_PUBLIC
```

**必须删除或留空**这些变量，否则构建时会覆盖 Dockerfile 中的默认值。

### 4.3 前端登录逻辑

```typescript
// 登录按钮跳转到受保护的前端路由
export function buildGatewayLoginUrl(): string {
  const loginUrl = process.env.NEXT_PUBLIC_GATEWAY_LOGIN_URL || '/';
  return loginUrl.startsWith('/') ? apiUrl(loginUrl) : loginUrl;
}
```

> 整个前端在 OIDC 保护下，未登录用户无法访问前端页面。登录按钮直接跳转到首页，Envoy 会自动触发 OIDC 流程。

## 5. Casdoor 配置

### 5.1 创建 Application

在 Casdoor 中为每个前端应用创建独立的 Application：

| 字段 | 值 |
|------|-----|
| Name | `aisphere-iam` |
| Organization | `aisphere` |
| Client ID | 自动生成（UUID） |
| Redirect URIs | `https://iam.weagent.cc:30723/oauth2/callback` |
| Grant Types | `authorization_code`, `password` |

### 5.2 创建 OIDC Secret

```bash
kubectl create secret generic casdoor-iam-oidc -n aisphere \
  --from-literal=client-secret=<Casdoor 中的 client_secret>
```

### 5.3 用户管理

Casdoor 中每个组织有独立的用户体系。`built-in` 组织的 `admin` 用户（密码 `123`）是超级管理员，可以管理所有组织。

为每个前端应用创建对应的组织（如 `aisphere`），并在该组织下创建用户。

## 6. 后端配置

### 6.1 IAM 后端

```yaml
security:
  authn:
    enabled: true
    mode: gateway_trusted
    provider: casdoor
    oidc:
      issuer: https://casdoor.weagent.cc:30723
      discovery_url: https://casdoor.weagent.cc:30723/.well-known/openid-configuration
      jwks_url: https://casdoor.weagent.cc:30723/.well-known/jwks
      audience: ["<CASDOOR_CLIENT_ID>"]
    casdoor:
      endpoint: http://casdoor.aisphere:8000
      client_id: "${CASDOOR_CLIENT_ID}"
      client_secret: "${CASDOOR_CLIENT_SECRET}"
```

> **注意**：`oidc.issuer` 使用外部地址（与 token 的 `iss` 一致），`casdoor.endpoint` 使用集群内地址（管理 SDK 调用）。

### 6.2 敏感信息管理

所有敏感信息通过 Kubernetes Secret 注入，ConfigMap 只存非敏感配置：

```yaml
# Secret
apiVersion: v1
kind: Secret
metadata:
  name: aisphere-iam-secrets
  namespace: aisphere
stringData:
  postgres-dsn: "postgres://..."
  casdoor-client-id: "..."
  casdoor-client-secret: "..."
  spicedb-token: "..."
```

```yaml
# ConfigMap 中引用
data:
  config.yaml: |
    data:
      database:
        config:
          dsn: "${POSTGRES_DSN}"
```

## 7. 常见问题排查

### 7.1 浏览器显示 502 Bad Gateway

**原因**：OIDC 跳转地址使用了集群内地址，浏览器无法访问。

**检查**：SecurityPolicy 中的 `authorizationEndpoint` 必须是外部可访问的 URL。

**修复**：
```yaml
authorizationEndpoint: https://casdoor.weagent.cc:30723/login/oauth/authorize
# 而不是
authorizationEndpoint: http://casdoor.aisphere:8000/login/oauth/authorize
```

### 7.2 Casdoor 提示 client_id 错误

**原因**：SecurityPolicy 中的 `clientID` 使用了 Application 名称，而不是 UUID。

**检查**：从 Casdoor 数据库查看实际的 client_id：
```bash
kubectl exec apps-postgre-0 -- psql -U postgres -d casdoor \
  -c "SELECT name, client_id FROM application;"
```

**修复**：使用 UUID 作为 `clientID`。

### 7.3 OIDC 登录后跳转到不带端口的地址

**原因**：SecurityPolicy 中的 `redirectURL` 没有带端口，或者 Casdoor 中注册的 redirect URI 不匹配。

**修复**：确保 SecurityPolicy 和 Casdoor 中的 redirect URI 完全一致（包括端口）。

### 7.4 前端登录后仍显示未登录

**原因**：前端 `NEXT_PUBLIC_IAM_URL` 被编译成了不带端口的地址，请求发到了 443 端口。

**排查**：检查前端 JS bundle 中的 API 地址：
```bash
# 查看构建产物中的 API 地址
grep -r "iam.weagent.cc" .next/static/
```

**修复**：删除 GitHub Actions Variables 中的 `NEXT_PUBLIC_IAM_URL`，重新构建。

### 7.5 SecurityPolicy 状态为 Invalid

**原因**：`passThroughAuthHeader: true` 与 JWT provider 的 `extractFrom` 配置不匹配。

**修复**：JWT provider 需要同时支持从 header 和 cookie 提取：
```yaml
extractFrom:
  cookies:
    - Aisphere-IAM-AccessToken
  headers:
    - name: Authorization
      valuePrefix: "Bearer "
```

### 7.6 OIDC Discovery 超时

**原因**：Envoy 无法通过外部域名访问 Casdoor 的 OIDC discovery 端点。

**修复**：指定 `authorizationEndpoint` 和 `tokenEndpoint` 跳过 discovery：
```yaml
provider:
  authorizationEndpoint: https://casdoor.weagent.cc:30723/login/oauth/authorize
  tokenEndpoint: http://casdoor.aisphere:8000/api/login/oauth/access_token
```

### 7.7 域名解析错误

**原因**：域名解析到了错误的 IP（如代理地址）。

**修复**：修改本地 hosts 文件：
```
36.137.200.194 iam.weagent.cc
36.137.200.194 casdoor.weagent.cc
```

## 8. 验证命令

```bash
# 1. 测试 OIDC 跳转
curl -k -s -D - https://iam.weagent.cc:30723/ -o /dev/null | head -20
# 应返回 302 跳转到 Casdoor

# 2. 测试 Casdoor 直接访问
curl -k -s https://casdoor.weagent.cc:30723/ | head -5
# 应返回 Casdoor 登录页 HTML

# 3. 测试 IAM 后端健康检查
curl -k -s https://iam.weagent.cc:30723/healthz
# 应返回 200 OK

# 4. 测试 IAM API（未登录应返回 401）
curl -k -s https://iam.weagent.cc:30723/v1/iam/me
# 应返回 302 跳转到 Casdoor

# 5. 查看 SecurityPolicy 状态
kubectl -n aisphere describe securitypolicy iam-console-oidc | grep -E 'Message:|Reason:|Status:'
# 应显示 Policy has been accepted

# 6. 查看 Envoy 日志
kubectl -n envoy-gateway-system logs deployment/envoy-aisphere-aisphere-gateway-a9bdf3e3 --tail=20
```