---
title: Envoy Gateway + Casdoor OIDC 认证体系
description: Aisphere 第一阶段基于 Envoy Gateway、Casdoor OIDC、JWT claimToHeaders 和 Kernel proto 注解的认证接入方案。
---

# Envoy Gateway + Casdoor OIDC 认证体系

本文定义 Aisphere 第一阶段 OIDC-only 入口体系。

## 1. 总体定位

```text
Casdoor        = OIDC Provider
Envoy Gateway  = OIDC 登录、JWT 验签、claimToHeaders、header sanitize、路由转发
Aisphere IAM   = 后端目录/权限服务；不作为 Gateway 前置授权服务
Kernel         = proto 注解、生成器、服务端/客户端安全 middleware
业务服务        = 读取 verified external identity，按需调用 IAM
```

第一阶段不要求 IAM 自己成为 OIDC Provider。Gateway 直接接 Casdoor OIDC/JWKS；业务服务通过 Kernel middleware 读取 Gateway 产生的 `x-aisphere-external-*`。

本阶段不做：

```text
Gateway 前置授权
x-aisphere-principal 注入
x-aisphere-internal-jwt 注入
```

## 2. 外部到内部服务链路

```text
Browser / CLI / Agent
  -> Envoy Gateway
  -> Casdoor OIDC/JWT
  -> claimToHeaders
  -> Hub / Runtime / Git / IAM
```

能力：

- HTTPS / optional client mTLS
- Casdoor OIDC 登录
- Casdoor JWKS JWT 验签
- JWT claim to header
- 清理客户端伪造的 `x-aisphere-*`
- Gateway 到 Backend TLS/mTLS

## 3. 接口安全分级

| 级别 | 是否登录 | Gateway 行为 | 后端行为 | 示例 |
|---|---:|---|---|---|
| public | 否 | 不挂 SecurityPolicy | 不要求 identity | `/healthz`、`/readyz`、`/openapi.json` |
| authn | 是 | 挂 OIDC/JWT | 读取 `x-aisphere-external-*` | `/api/v1/me` |
| authz | 是 | 挂 OIDC/JWT | 后端通过 Kernel accessx/IAM client 授权 | `/api/v1/agents/*` |

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

其中 protected route 在本阶段也只挂 OIDC/JWT，不挂 Gateway 前置授权。

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

### 5.2 本阶段不输出的内部 Header

本阶段 Gateway 不输出：

```text
x-aisphere-principal
x-aisphere-user-id
x-aisphere-org-id
x-aisphere-project-id
x-aisphere-roles
x-aisphere-authz-decision-id
x-aisphere-internal-jwt
```

这些留给后续阶段。

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

## 8. 后端处理

后端 Kernel middleware：

```text
1. 从 x-aisphere-external-* 恢复 external identity。
2. 可选使用 forwarded Authorization 做二次校验。
3. AUTHN_ONLY 接口只要求 external identity 存在。
4. AUTHZ 接口由 accessx 使用 external identity 或 IAM Directory 映射后的 Principal 做业务授权。
5. 内部调用走 service token，不依赖 OIDC cookie。
```

## 9. 内部服务调用

内部调用统一走 Kernel outbound middleware：

```http
Authorization: Bearer <aisphere-service-token>
x-aisphere-call-type: service
x-aisphere-source-service: hub
x-aisphere-request-id: req_...
```

被调服务通过 Kernel inbound middleware 校验 service token。

## 10. 验收

```bash
# public 不登录
curl -i https://hub.aisphere.local/healthz

# authn/protected 未登录应拒绝或跳转
curl -i https://hub.aisphere.local/api/v1/me

# bearer 请求进入 JWT 验签并输出 x-aisphere-external-*
curl -i https://hub.aisphere.local/api/v1/me \
  -H "Authorization: Bearer <casdoor-token>"

# 伪造 principal 必须被清理
curl -i https://hub.aisphere.local/api/v1/me \
  -H "x-aisphere-principal: user:admin"
```

## 11. 后续阶段

后续再增加：

```text
Gateway 调 IAM 做前置授权
IAM 返回 x-aisphere-principal
IAM 签发 x-aisphere-internal-jwt
后端校验 IAM JWKS
```
