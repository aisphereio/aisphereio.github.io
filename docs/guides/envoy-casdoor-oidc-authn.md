---
title: Envoy Gateway + Casdoor OIDC 认证体系
description: Aisphere 第一阶段基于 Envoy Gateway、Casdoor OIDC、IAM ExtAuth 和 Kernel proto 注解的认证鉴权接入方案。
---

# Envoy Gateway + Casdoor OIDC 认证体系

本文定义 Aisphere 第一阶段 Authn/Authz 入口体系。

## 1. 总体定位

```text
Casdoor        = OIDC Provider
Envoy Gateway  = 入口认证执行点
Aisphere IAM   = principal 映射、ExtAuth、资源级授权、internal JWT
Kernel         = proto 注解、生成器、服务端/客户端安全 middleware
业务服务        = 读取可信 principal，执行业务逻辑
```

第一阶段不要求 IAM 自己成为 OIDC Provider。Gateway 直接接 Casdoor OIDC/JWKS；IAM 负责把 Casdoor 用户映射为 Aisphere 用户、组织、项目和权限上下文。

## 2. 两条安全链路

### 2.1 外部到内部服务

```text
Browser / CLI / Agent
  -> Envoy Gateway
  -> Casdoor OIDC/JWT
  -> claimToHeaders
  -> IAM ExtAuth
  -> Hub / Runtime / Git / IAM
```

能力：

- HTTPS / optional client mTLS
- Casdoor OIDC 登录
- Casdoor JWKS JWT 验签
- JWT claim to header
- 清理客户端伪造的 `x-aisphere-*`
- IAM ExtAuth 返回 Aisphere principal
- optional `x-aisphere-internal-jwt`
- Gateway 到 Backend TLS/mTLS

### 2.2 内部服务互调

第一阶段：

```text
Kernel service token + NetworkPolicy + optional Backend mTLS
```

第二阶段：

```text
Istio/Ambient Mesh mTLS + AuthorizationPolicy + IAM internal JWT
```

## 3. 接口安全分级

| 级别 | 是否登录 | 是否 IAM 授权 | Gateway 行为 | 示例 |
|---|---:|---:|---|---|
| public | 否 | 否 | 不挂 SecurityPolicy | `/healthz`、`/readyz`、`/openapi.json` |
| authn | 是 | 否 | 挂 OIDC/JWT | `/api/v1/me` |
| authz | 是 | 是 | 挂 OIDC/JWT + ExtAuth | `/api/v1/agents/*` |

重要原则：

```text
不要把 OIDC 挂到 Gateway 全局。
只给 authn/authz route 挂 SecurityPolicy。
public route 不挂 SecurityPolicy。
所有 route 都必须清理内部 header。
```

## 4. Proto 驱动生成

业务服务只在 proto 方法上声明安全语义：

```proto
rpc PublishAgent(PublishAgentRequest) returns (PublishAgentReply) {
  option (google.api.http) = {
    post: "/api/v1/agents/{agent_id}/publish"
    body: "*"
  };

  option (aisphere.access.v1.policy) = {
    mode: AUTHZ
    resource: "hub.agent"
    action: "publish"
    exposure: PUBLIC
    require_internal_jwt: true
  };
}
```

生成器根据 proto 生成：

```text
<service>-public-route
<service>-authn-route
<service>-protected-route
<service>-authn-security-policy
<service>-protected-security-policy
```

## 5. Header 规范

### 5.1 Gateway claimToHeaders 输出

这些 header 来自 Casdoor JWT，只表示 external identity：

```text
x-aisphere-external-sub
x-aisphere-external-email
x-aisphere-external-name
x-aisphere-external-username
```

不要把它们直接当 Aisphere user id。

### 5.2 IAM ExtAuth 输出

这些 header 由 IAM 返回，Gateway 注入给后端：

```text
x-aisphere-principal
x-aisphere-user-id
x-aisphere-org-id
x-aisphere-project-id
x-aisphere-roles
x-aisphere-authz-decision-id
x-aisphere-internal-jwt
```

业务服务只读取这些可信 header。

## 6. Header Sanitize

所有进入 Gateway 的请求必须清理：

```yaml
apiVersion: gateway.envoyproxy.io/v1alpha1
kind: ClientTrafficPolicy
metadata:
  name: aisphere-sanitize-headers
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

## 7. OIDC/JWT 策略示例

```yaml
apiVersion: gateway.envoyproxy.io/v1alpha1
kind: SecurityPolicy
metadata:
  name: hub-authn-policy
spec:
  targetRefs:
    - group: gateway.networking.k8s.io
      kind: HTTPRoute
      name: hub-authn-route
  oidc:
    provider:
      issuer: "https://casdoor.aisphere.local"
    clientID: "aisphere-gateway"
    clientSecret:
      name: casdoor-gateway-client-secret
    redirectURL: "https://hub.aisphere.local/oauth2/callback"
    logoutPath: "/logout"
    scopes: ["openid", "profile", "email"]
    refreshToken: true
    forwardAccessToken: true
    passThroughAuthHeader: true
    disableTokenEncryption: false
  jwt:
    providers:
      - name: casdoor
        issuer: "https://casdoor.aisphere.local"
        audiences: ["aisphere-gateway"]
        remoteJWKS:
          uri: "https://casdoor.aisphere.local/.well-known/jwks"
        claimToHeaders:
          - claim: sub
            header: x-aisphere-external-sub
          - claim: email
            header: x-aisphere-external-email
```

## 8. Protected Route ExtAuth

```yaml
extAuth:
  http:
    backendRefs:
      - name: aisphere-iam
        port: 8080
    pathOverride: /v1/extauth/check
    headersToBackend:
      - x-aisphere-principal
      - x-aisphere-user-id
      - x-aisphere-org-id
      - x-aisphere-project-id
      - x-aisphere-roles
      - x-aisphere-authz-decision-id
      - x-aisphere-internal-jwt
  headersToExtAuth:
    - Authorization
    - Cookie
    - X-Request-Id
    - X-Forwarded-For
    - X-Forwarded-Proto
    - X-Forwarded-Host
    - x-aisphere-external-sub
    - x-aisphere-external-email
  failOpen: false
  timeout: 2s
```

## 9. IAM ExtAuth 语义

IAM `/v1/extauth/check`：

```text
1. 读取 Casdoor token / Gateway external claims。
2. external_issuer + external_sub -> Aisphere user。
3. 解析 org/project context。
4. 根据 route metadata 推导 resource/action。
5. 执行业务权限判断。
6. 返回 principal headers。
7. 可选签发短期 internal JWT。
```

成功响应：

```http
x-aisphere-principal: user:u_123
x-aisphere-user-id: u_123
x-aisphere-org-id: org_001
x-aisphere-project-id: proj_001
x-aisphere-authz-decision-id: dec_01HX...
x-aisphere-internal-jwt: eyJhbGciOiJSUzI1NiIs...
```

## 10. Internal JWT

`x-aisphere-internal-jwt` 由 IAM 签发，后端通过 IAM JWKS 验签。

```json
{
  "iss": "https://iam.aisphere.local",
  "aud": "aisphere-internal-services",
  "sub": "user:u_123",
  "typ": "internal_gateway_principal",
  "external_iss": "https://casdoor.aisphere.local",
  "external_sub": "casdoor_user_sub",
  "org_id": "org_001",
  "project_id": "proj_001",
  "decision_id": "dec_01HX...",
  "source": "envoy-gateway",
  "exp": 1710000300
}
```

禁止使用 `x-jwt-secret` / `x-auth-secret` 这种共享 secret header。

## 11. 内部服务调用

内部调用统一走 Kernel outbound middleware：

```http
Authorization: Bearer <aisphere-service-token>
x-aisphere-call-type: service
x-aisphere-source-service: hub
x-aisphere-request-id: req_...
```

被调服务通过 Kernel inbound middleware 校验 service token。

## 12. 验收

```bash
# public 不登录
curl -i https://hub.aisphere.local/healthz

# protected 未登录应拒绝或跳转
curl -i https://hub.aisphere.local/api/v1/agents

# token 请求进入 JWT + ExtAuth
curl -i https://hub.aisphere.local/api/v1/agents \
  -H "Authorization: Bearer <casdoor-token>"

# 伪造 principal 必须被清理
curl -i https://hub.aisphere.local/api/v1/agents \
  -H "x-aisphere-principal: user:admin"
```
