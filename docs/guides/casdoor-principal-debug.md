---
title: Casdoor Token Principal 调试指南
description: 使用 Kernel authn 框架调试 Casdoor JWT 的 Principal 提取过程，包括 OAuth2 Password Grant、JWKS 自动发现和 Principal 字段映射。
---

# Casdoor Token Principal 调试指南

## 背景

在 Aisphere 认证体系中，Casdoor 作为 OIDC Provider 签发 JWT。Kernel 框架的 `authn/casdoor` 适配器负责将 Casdoor JWT 解析为规范化的 `authn.Principal`。

调试过程中需要回答一个核心问题：

> **Casdoor 签发的 token 解密后，Principal 的 SubjectID 是什么？**

本文记录完整的调试过程和工具脚本，供后续开发参考。

## 调试流程

### 1. 确认代码一致性

首先确认本地 Kernel 代码与远端 GitHub 一致：

```bash
cd kernel
git remote -v
# origin  git@github.com:aisphereio/kernel.git

git fetch origin master
git log --oneline HEAD..origin/master
# （无输出，表示一致）
```

### 2. 理解 Principal 提取逻辑

Kernel 框架的 Principal 提取链路：

```
OAuth2 Token → parseJWTToken() → validateClaims() → principalFromClaims()
```

关键代码位置：

| 步骤 | 文件 | 函数 |
|------|------|------|
| JWT 解析 | `authn/casdoor/token.go:123` | `parseJWTToken()` |
| 签名验证 | `authn/casdoor/token.go:151` | `jwtKeyFunc()` |
| Claims 验证 | `authn/casdoor/token.go:181` | `validateClaims()` |
| Principal 映射 | `authn/casdoor/token.go:258` | `principalFromClaims()` |

**SubjectID 优先级**（`principalFromClaims` 第 262 行）：

```go
subjectID := firstNonEmpty(claims.Id, claims.ExternalId, claims.Subject, claims.Name)
```

即：`Id` > `ExternalId` > `Subject` > `Name`

### 3. 获取 Casdoor 应用配置

Casdoor 的 OAuth2 Password Grant 需要应用启用密码登录。通过 Casdoor 管理 API 查询：

```bash
# 登录 Casdoor 管理后台（built-in 组织）
curl -s -X POST "http://<casdoor-endpoint>/api/login" \
  -H "Content-Type: application/json" \
  -d '{"application":"app-built-in","organization":"built-in","username":"admin","password":"<password>","type":"login"}'

# 查询应用详情
curl -s -b "<cookie>" "http://<casdoor-endpoint>/api/get-application?id=admin/<app-name>"
```

关键字段：

| 字段 | 说明 | 要求 |
|------|------|------|
| `enablePassword` | 是否启用密码登录 | 必须为 `true` |
| `grantTypes` | 支持的 OAuth2 Grant 类型 | 必须包含 `password` |
| `clientId` | OAuth2 Client ID | 用于 token 请求 |
| `clientSecret` | OAuth2 Client Secret | 用于 token 请求 |
| `cert` | 签名证书 | 用于 JWT 验签 |

### 4. 通过 Password Grant 获取 Token

```bash
curl -s -X POST "http://<casdoor-endpoint>/api/login/oauth/access_token" \
  -d "grant_type=password" \
  -d "client_id=<client-id>" \
  -d "client_secret=<client-secret>" \
  -d "username=<username>" \
  -d "password=<password>" \
  -d "scope=openid profile email"
```

成功响应示例：

```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJSUzI1NiIs...",
  "token_type": "Bearer",
  "expires_in": 604800,
  "scope": "openid profile email"
}
```

### 5. 解码 JWT 查看原始 Claims

```bash
# 提取 JWT Payload（第二部分）
PAYLOAD=$(echo "$TOKEN" | cut -d'.' -f2)
# 补全 Base64 填充
case $((${#PAYLOAD} % 4)) in
  2) PAYLOAD="${PAYLOAD}==" ;;
  3) PAYLOAD="${PAYLOAD}=" ;;
esac
echo "$PAYLOAD" | base64 -d | python3 -m json.tool
```

JWT Payload 示例：

```json
{
  "owner": "aisphere",
  "name": "admin",
  "id": "496333c7-7acc-4717-8596-056544fc0a68",
  "type": "normal-user",
  "displayName": "管理员",
  "email": "user@example.com",
  "phone": "13800138000",
  "iss": "https://casdoor.example.com:30723",
  "sub": "496333c7-7acc-4717-8596-056544fc0a68",
  "aud": ["<client-id>"],
  "exp": 1784106688,
  "iat": 1783501888,
  "tokenType": "access-token"
}
```

### 6. 使用 Kernel 框架验证 Token

Kernel 框架的 `authn/casdoor` 适配器支持通过 OIDC Discovery + JWKS 自动获取公钥验证 JWT。

```go
// 配置 JWKS 自动发现
cfg := casdoorauthn.Config{
    Endpoint:        "http://<casdoor-endpoint>",
    OrganizationName: "aisphere",
    ApplicationName:  "aisphere-iam",
    ClientID:         "<client-id>",
    ClientSecret:     "<client-secret>",
    DiscoveryURL:     "http://<casdoor-endpoint>/.well-known/openid-configuration",
    Issuer:           "https://<casdoor-external-domain>:30723", // 必须匹配 JWT iss
    AllowedOwners:    []string{"aisphere"},
    Audience:         []string{"<client-id>"},
}

client, _ := casdoorauthn.New(cfg)
principal, _ := client.VerifyToken(ctx, authn.VerifyTokenRequest{
    Token:     accessToken,
    TokenType: "access_token",
    OrgID:     "aisphere",
    AppID:     "aisphere-iam",
})
```

## 常见问题

### Issuer 不匹配

JWT 中的 `iss` 字段是 Casdoor 的外部域名（如 `https://casdoor.example.com:30723`），但 `endpoint` 配置的是内部地址（如 `http://10.0.0.1:30082`）。需要显式设置 `Issuer` 字段：

```go
cfg.Issuer = "https://casdoor.example.com:30723" // 匹配 JWT 的 iss
```

### 应用未启用 Password Grant

Casdoor 应用需要同时满足：
- `enablePassword: true`
- `grantTypes` 包含 `"password"`

如果应用不满足，需要创建或修改应用配置。

### 密码被锁定

Casdoor 有登录失败次数限制（默认 5 次），超过后账号会被冻结。需要通过管理 API 重置：

```bash
# 获取用户信息
curl -s -b "<cookie>" "http://<casdoor-endpoint>/api/get-user?id=<org>/<username>"

# 重置登录错误次数并设置新密码
curl -s -X POST -b "<cookie>" \
  "http://<casdoor-endpoint>/api/set-password?userOwner=<org>&userName=<username>&oldPassword=&newPassword=<new-password>"
```

## 测试工具

Kernel 仓库中提供了一个测试工具 `check_principal`，位于 `examples/authn-casdoor/cmd/check_principal/`。

### 使用方式

```bash
cd kernel
go run ./examples/authn-casdoor/cmd/check_principal/ \
  -config examples/authn-casdoor/config.remote.yaml
```

### 配置文件示例

```yaml
casdoor:
  endpoint: "http://<casdoor-endpoint>"
  client_id: "<client-id>"
  client_secret: "<client-secret>"
  organization: "aisphere"
  application: "aisphere-iam"
  http_timeout: "15s"
  default_scope: "openid profile email"

authn_example:
  password: "<password>"
```

### 输出示例

```
========== PRINCIPAL SUMMARY ==========
  SubjectID:   "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  SubjectType: "user"
  Username:    "admin"
  Name:        "管理员"
  Email:       "user@example.com"
  Phone:       "13800138000"
  OrgID:       "aisphere"
  AppID:       "aisphere-iam"
  ExternalID:  "aisphere/admin"
  Issuer:      "https://casdoor.example.com:30723"
  Audience:    [<client-id>]
  Roles:       []
  Groups:      []
  AuthMethod:  "oidc"
  Attributes:  map[casdoor_id:a1b2c3d4-... casdoor_name:admin casdoor_owner:aisphere]
========================================
```

## Principal 字段映射表

| Principal 字段 | JWT Claim | 说明 |
|----------------|-----------|------|
| `SubjectID` | `id` / `externalId` / `sub` / `name` | 按优先级取第一个非空值 |
| `Username` | `name` | Casdoor 用户名 |
| `Name` | `displayName` / `name` | 显示名称 |
| `Email` | `email` | 邮箱 |
| `Phone` | `phone` | 手机号 |
| `OrgID` | `owner` | Casdoor 组织 |
| `ExternalID` | `owner/name` | 格式为 `组织/用户名` |
| `Issuer` | `iss` | JWT 签发者 |
| `Audience` | `aud` | JWT 受众 |
| `Roles` | `roles[].name` | 角色列表 |
| `Groups` | `groups` | 组列表 |
| `AuthMethod` | 固定值 | `"oidc"` |

## Envoy Gateway claimToHeaders 精度分析

### 当前配置

Envoy Gateway 的 `SecurityPolicy` 通过 `claimToHeaders` 将 JWT claims 映射为 HTTP header，后端服务通过 `PrincipalFromTrustedHeaders()` 重建 Principal。

### 精度损失分析

对比 Casdoor JWT 中的非空 claims 与 Envoy 当前暴露的 headers：

| JWT Claim | 值示例 | Envoy 是否暴露 | Kernel 是否使用 | 精度损失 |
|-----------|--------|:---:|:---:|:---:|
| `sub` | `496333c7-...` | ✅ `x-aisphere-external-sub` | ✅ SubjectID | 无 |
| `iss` | `https://casdoor.example.com:30723` | ❌ **缺失** | ✅ Issuer | **有损失** |
| `email` | `user@example.com` | ✅ `x-aisphere-external-email` | ✅ Email | 无 |
| `name` | `admin` | ✅ `x-aisphere-external-name` | ✅ Username | 无 |
| `displayName` | `管理员` | ❌ **缺失** | ❌ 未使用 | 可忽略 |
| `owner` | `aisphere` | ❌ **缺失** | ✅ OrgID | **有损失** |
| `id` | `496333c7-...` | ❌ **缺失** | ✅ SubjectID（优先） | **有损失** |
| `phone` | `13800138000` | ❌ **缺失** | ✅ Phone | **有损失** |
| `scope` | `openid profile email` | ❌ **缺失** | ✅ Scopes | **有损失** |
| `azp` | `<client-id>` | ❌ **缺失** | ❌ 未使用 | 可忽略 |
| `type` | `normal-user` | ❌ **缺失** | ❌ 未使用 | 可忽略 |
| `roles` | `[]` | ❌ **缺失** | ✅ Roles | 当前为空 |
| `groups` | `[]` | ❌ **缺失** | ✅ Groups | 当前为空 |

### 关键精度损失

1. **`iss`（Issuer）**：Kernel 的 `principalFromGatewayClaimHeaders` 会读取 `x-aisphere-external-issuer` 作为 `Principal.Issuer`，但 Envoy 没有暴露这个字段。
2. **`owner`（OrgID）**：Kernel 期望 `x-aisphere-org-id` 作为 `Principal.OrgID`，但 Envoy 没有暴露。
3. **`id`（用户 UUID）**：Kernel 的 SubjectID 优先级是 `id` > `sub`，但 Envoy 只暴露了 `sub`，导致后端无法获取 Casdoor 的 `id` 字段。
4. **`phone`（电话）**：Kernel 的 `Principal.Phone` 没有来源。

### 修复方案

在 Envoy `SecurityPolicy` 的 `claimToHeaders` 中补全以下映射：

```yaml
claimToHeaders:
  # 已有
  - claim: sub
    header: x-aisphere-external-sub
  - claim: email
    header: x-aisphere-external-email
  - claim: name
    header: x-aisphere-external-name

  # 新增
  - claim: iss
    header: x-aisphere-external-issuer
  - claim: displayName
    header: x-aisphere-external-display-name
  - claim: phone
    header: x-aisphere-external-phone
  - claim: owner
    header: x-aisphere-external-owner
  - claim: id
    header: x-aisphere-external-id
  - claim: type
    header: x-aisphere-external-type
  - claim: scope
    header: x-aisphere-external-scope
  - claim: azp
    header: x-aisphere-external-authorized-party

  # 内部投影（需配合 header sanitize）
  - claim: sub
    header: x-aisphere-principal
  - claim: id
    header: x-aisphere-user-id
  - claim: owner
    header: x-aisphere-org-id
```

同时需要在 `ClientTrafficPolicy` 的 sanitize 列表中添加所有新增的 header 名称，防止客户端伪造。

### Envoy claimToHeaders 完整字段映射表

修复后，Envoy Gateway 的 `claimToHeaders` 将 JWT claims 转换为以下 HTTP headers：

| HTTP Header | JWT Claim | 值示例 | 说明 |
|-------------|-----------|--------|------|
| `x-aisphere-external-sub` | `sub` | `496333c7-7acc-4717-8596-056544fc0a68` | JWT 主体（用户 UUID） |
| `x-aisphere-external-issuer` | `iss` | `https://casdoor.example.com:30723` | JWT 签发者 |
| `x-aisphere-external-email` | `email` | `user@example.com` | 邮箱 |
| `x-aisphere-external-email-verified` | `email_verified` | `false` | 邮箱是否已验证 |
| `x-aisphere-external-name` | `name` | `admin` | 用户名 |
| `x-aisphere-external-display-name` | `displayName` | `管理员` | 显示名称 |
| `x-aisphere-external-phone` | `phone` | `13800138000` | 手机号 |
| `x-aisphere-external-owner` | `owner` | `aisphere` | Casdoor 组织 |
| `x-aisphere-external-id` | `id` | `496333c7-7acc-4717-8596-056fa1a68` | Casdoor 用户 ID |
| `x-aisphere-external-type` | `type` | `normal-user` | 用户类型 |
| `x-aisphere-external-scope` | `scope` | `openid profile email` | OAuth2 scope |
| `x-aisphere-external-authorized-party` | `azp` | `869aff97ab0408cbbd1c` | Authorized party（Client ID） |
| `x-aisphere-principal` | `sub` | `496333c7-7acc-4717-8596-056fa1a68` | 内部投影：Principal ID |
| `x-aisphere-user-id` | `id` | `496333c7-7acc-4717-8596-056fa1a68` | 内部投影：用户 UUID |
| `x-aisphere-org-id` | `owner` | `aisphere` | 内部投影：组织 ID |

### Envoy 到 Kernel Principal 的完整映射链路

Envoy 通过 `claimToHeaders` 注入的 headers 进入后端后，Kernel 的 `principalFromGatewayClaimHeaders()` 按以下规则重建 `authn.Principal`：

```text
x-aisphere-external-sub       ──→ Principal.ExternalID
x-aisphere-principal           ──→ Principal.SubjectID（优先）
x-aisphere-user-id             ──→ Principal.SubjectID（次优先）
x-aisphere-external-sub        ──→ Principal.SubjectID（兜底）
x-aisphere-external-issuer     ──→ Principal.Issuer
x-aisphere-external-email      ──→ Principal.Email
x-aisphere-external-name       ──→ Principal.Name
x-aisphere-external-username   ──→ Principal.Username
x-aisphere-org-id              ──→ Principal.OrgID / Principal.TenantID
x-aisphere-project-id          ──→ Principal.ProjectID
x-aisphere-roles               ──→ Principal.Roles（逗号分隔）
x-aisphere-groups              ──→ Principal.Groups（逗号分隔）
x-aisphere-scopes              ──→ Principal.Scopes（逗号分隔）
x-aisphere-provider            ──→ Principal.Provider
```

SubjectID 优先级逻辑（`principalFromGatewayClaimHeaders` 第 187 行）：

```text
1. x-aisphere-principal（GatewayClaimHeaderPrincipal）
2. x-aisphere-user-id（GatewayClaimHeaderUserID）
3. x-aisphere-external-sub（GatewayClaimHeaderExternalSub）
```

当 `X-Aisphere-Auth-Verified: true` 存在时，走 `principalFromExplicitTrustedHeaders()` 路径，使用完整的 `X-Aisphere-*` 头族重建 Principal，精度更高。

## Kernel headers → context 精度分析

### 完整链路

```
Envoy claimToHeaders (HTTP headers)
  → GatewayTrustedExtractor (middleware/authn/authn.go:114)
    → PrincipalFromTrustedHeaders (authn/trusted_headers.go:164)
      → principalFromGatewayClaimHeaders (authn/trusted_headers.go:199)
        → authn.Principal（完整 21 个字段）
      → principalFromExplicitTrustedHeaders (authn/trusted_headers.go:171)
        → authn.Principal（完整 21 个字段）
    → withPrincipal (middleware/authn/authn.go:153)
      → authn.ContextWithPrincipal（存储完整 authn.Principal）
      → contextx.WithAuthnPrincipal（✅ 无损镜像，PR #27 修复）
      → contextx.WithTenant（TenantID 或 OrgID）
```

### 健壮性评估

| 函数 | 缺失字段行为 | 是否报错 |
|------|-------------|:-------:|
| `principalFromGatewayClaimHeaders` | 返回空字符串，SubjectID 为空时返回 `false` | ❌ 不报错 |
| `principalFromExplicitTrustedHeaders` | 返回空字符串，SubjectID 为空时返回 `false` | ❌ 不报错 |
| `headerValue()` | header 不存在返回空字符串 | ❌ 不报错 |
| `splitCSV()` | 空字符串返回空切片；支持逗号、分号、空白字符分隔 | ❌ 不报错 |
| `GatewayTrustedExtractor` | 只收集非空 header 到 metadata | ❌ 不报错 |
| `TrustedHeaderAuthenticator.Authenticate` | Principal 为空时返回错误 | ✅ 返回 `ErrMissingCredential` |

**结论：健壮性良好。** 所有缺失字段的处理都是安全的——返回空字符串或空切片，不会 panic 或报错。唯一会拒绝请求的情况是 `SubjectID` 完全缺失（所有候选 header 都为空），这是合理的安全检查。

### PR #27 修复：contextx.Principal 无损镜像

**修复前**（Kernel v0.4.x）：`contextx.Principal` 只有 5 个字段，`WithAuthnPrincipal` 丢失 12 个字段。

**修复后**（Kernel v0.5.0+，PR #27）：`contextx.Principal` 扩展为 21 个字段，与 `authn.Principal` 完全对应：

| authn.Principal 字段 | contextx.Principal 字段 | 修复前 | 修复后 |
|---------------------|------------------------|:------:|:------:|
| `SubjectID` | `SubjectID` | ✅ | ✅ |
| `SubjectType` | `SubjectType` | ❌ | ✅ |
| `Provider` | `Provider` | ❌ | ✅ |
| `ExternalID` | `ExternalID` | ❌ | ✅ |
| `Issuer` | `Issuer` | ❌ | ✅ |
| `Audience` | `Audience` | ❌ | ✅ |
| `TenantID` | `TenantID` | ✅ | ✅ |
| `OrgID` | `OrgID` | ❌ | ✅ |
| `AppID` | `AppID` | ❌ | ✅ |
| `ProjectID` | `ProjectID` | ❌ | ✅ |
| `Username` | `Username` | ❌ | ✅ |
| `Name` | `Name` | ❌ | ✅ |
| `Email` | `Email` | ❌ | ✅ |
| `Phone` | `Phone` | ❌ | ✅ |
| `Roles` | `Roles` | ✅ | ✅ |
| `Groups` | `Groups` | ❌ | ✅ |
| `Scopes` | `Scopes` | ✅ | ✅ |
| `AuthMethod` | `AuthMethod` | ✅ | ✅ |
| `Attributes` | `Attributes` | ❌ | ✅ |
| `IssuedAt` | `IssuedAt` | ❌ | ✅ |
| `ExpiresAt` | `ExpiresAt` | ❌ | ✅ |

同时新增 `FromAuthnPrincipal()` 和 `ToAuthnPrincipal()` 辅助函数，支持 `authn.Principal ↔ contextx.Principal` 无损互转。

### PR #27 修复：Gateway claim 读取增强

`principalFromGatewayClaimHeaders` 新增对以下 header 的支持：

| HTTP Header | JWT Claim | 映射到 Principal 字段 |
|-------------|-----------|----------------------|
| `x-aisphere-external-id` | `id` | `ExternalID`（优先于 `external-sub`） |
| `x-aisphere-external-owner` | `owner` | `OrgID` / `TenantID`（兜底） |
| `x-aisphere-external-display-name` | `displayName` | `Name`（优先于 `external-name`） |
| `x-aisphere-external-phone` | `phone` | `Phone` |
| `x-aisphere-external-scope` | `scope` | `Scopes`（空格/逗号/分号分隔） |

**SubjectID 优先级**（`principalFromGatewayClaimHeaders` 第 204 行）：

```text
1. x-aisphere-principal（GatewayClaimHeaderPrincipal）
2. x-aisphere-user-id（GatewayClaimHeaderUserID）
3. x-aisphere-external-id（GatewayClaimHeaderExternalID）← 新增
4. x-aisphere-external-sub（GatewayClaimHeaderExternalSub）
```

**OrgID/TenantID 优先级**（第 213 行）：

```text
1. x-aisphere-org-id（GatewayClaimHeaderOrgID）
2. x-aisphere-external-owner（GatewayClaimHeaderExternalOwner）← 新增
3. x-aisphere-owner（TrustedHeaderOwner）
```

### 验证结果

PR #27 合并后，在本地验证通过：

```bash
# Gateway claim headers → Principal 路径
go test ./authn -v -run "TestPrincipalFromGateway"
# PASS: TestPrincipalFromGatewayClaimHeaders
# PASS: TestPrincipalFromGatewayClaimHeadersCasdoorProfileClaims
# PASS: TestPrincipalFromGatewayClaimHeadersPrefersInternalProjection
# PASS: TestPrincipalFromGatewayClaimHeadersRequiresSubject

# contextx 无损镜像
go test ./contextx -v -run "Authn"
# PASS: TestWithAuthnPrincipalMirrorsAllFields

# 端到端模拟 Envoy 注入
go run ./examples/authn-casdoor/cmd/check_gateway_principal/
# ALL TESTS PASSED
```

### 业务使用规则

```go
// ✅ 推荐：authn.PrincipalFromContext 是业务 authn/authz 主入口
p, ok := authn.PrincipalFromContext(ctx)
if !ok {
    return nil, authn.ErrUnauthenticated("")
}
userID := p.SubjectID // 用户稳定 UUID
orgID := p.OrgID      // Casdoor owner / Aisphere org 投影
email := p.Email
name := p.Name

// ✅ contextx.PrincipalFromContext 现在也是无损的
cp := contextx.PrincipalFromContext(ctx)
cp.OrgID    // ✅ 不再丢失
cp.Username // ✅ 不再丢失
cp.Email    // ✅ 不再丢失

// ❌ 不要直接解析 Gateway header
// 业务 handler 不应该解析 x-aisphere-* header
// Kernel middleware 会自动完成 trusted headers → Principal → ctx 注入
```

## IAM 后端 Principal 使用审计

### 代码一致性

本地 `aisphere-iam` 代码与远端 GitHub `origin/main` 已合并同步，无差异。

### 认证模式：`gateway_trusted`

IAM 使用 `securityx.AuthnModeGatewayTrusted`（`"gateway_trusted"`）模式，配置在 `internal/server/access.go:37`：

```go
if strings.EqualFold(cfg.Authn.Mode, securityx.AuthnModeGatewayTrusted) {
    internalCall.Enabled = false  // 禁用旧的 Gateway-to-backend 共享 token
    internalCall.Token = ""
}
```

### 完整认证链路

```
Envoy Gateway OIDC 验证
  → 注入 X-Aisphere-* claim headers
  → IAM GatewayTrustedExtractor 提取 header
  → TrustedHeaderAuthenticator 验证（internal token 可选）
  → PrincipalFromTrustedHeaders 重建 authn.Principal
  → withPrincipal 注入 context
    → authn.ContextWithPrincipal(ctx, p)     // 完整 21 字段
    → contextx.WithAuthnPrincipal(ctx, p)    // 无损镜像
    → contextx.WithTenant(ctx, p.TenantID)   // TenantID 或 OrgID
```

### Principal 使用方式

IAM 业务代码全部使用 **`authn.PrincipalFromContext(ctx)`**，符合 Kernel 推荐范式：

| 文件 | 用途 | 使用方式 |
|------|------|---------|
| `internal/service/iam.go:76` | `GetMe()` 获取当前用户 | `authn.PrincipalFromContext` |
| `internal/service/iam.go:159` | `requireZonePermission()` SpiceDB 权限检查 | `authn.PrincipalFromContext` → `principal.SubjectID` + `principal.OrgID` |
| `internal/service/authz_admin.go:201` | `requireGlobalAuthz()` 全局权限检查 | `authn.PrincipalFromContext` → `principal.SubjectID` + `principal.OrgID` + `principal.ProjectID` |
| `internal/server/group_http.go:171` | `runWithGatewayPrincipal()` HTTP handler 辅助 | `authn.PrincipalFromContext` |
| `internal/service/control_plane.go:507` | `currentPrincipalSubject()` 控制面辅助 | `authn.PrincipalFromContext` → `SubjectType` + `SubjectID` |

`contextx.PrincipalFromContext` 仅由 protoc 生成的 authz 中间件代码使用（`api/iam/v1/*_authz.pb.go`），用于自动化的权限检查。

### PR #29 修复：控制面写操作使用 ctx Principal

**修复前**：`CreateOrganization / CreateProject / UpsertResource / BindResource / GrantAccess / RevokeAccess` 等控制面写操作，`Owner / CreatedBy / Actor` 来自请求体（`req.GetOwner()`、`in.GetCreatedBy()`），而不是服务端 ctx。

**修复后**（PR #29）：统一从 Kernel ctx 取当前调用者：

```go
func currentPrincipalSubject(ctx context.Context) (string, string, error) {
    principal, ok := authn.PrincipalFromContext(ctx)
    if !ok || !principal.IsAuthenticated() {
        return "", "", authn.ErrMissingCredential("kernel principal is required")
    }
    subjectType := strings.TrimSpace(principal.SubjectType)
    if subjectType == "" {
        subjectType = authn.SubjectTypeUser
    }
    return subjectType, strings.TrimSpace(principal.SubjectID), nil
}
```

具体行为变化：

| 写操作 | 修复前主体来源 | 修复后主体来源 |
|--------|:-------------:|:-------------:|
| `CreateOrganization.Owner` | `req.GetOwner()` | 强制来自 ctx Principal |
| `CreateProject.CreatedBy` | 请求体 | 来自 ctx Principal |
| `CreateProject.Owner` | 请求体 | 请求 owner 或 ctx Principal fallback |
| `UpsertResource.CreatedBy` | `in.GetCreatedBy()` | 来自 ctx Principal |
| `UpsertResource.Owner` | 请求体 | 请求 owner 或 ctx Principal fallback |
| `BindResource.CreatedBy` | 请求体 | 来自 ctx Principal |
| `GrantAccess.CreatedBy` | 请求体 | 来自 ctx Principal |
| `RevokeAccess.Actor` | 请求体 | 来自 ctx Principal |

### 是否符合 Kernel 推荐范式

| 检查项 | 结果 | 说明 |
|--------|:----:|------|
| 使用 `authn.PrincipalFromContext` | ✅ | 所有业务代码都使用此方式 |
| 不直接解析 `x-aisphere-*` header | ✅ | 全部由 Kernel middleware 自动处理 |
| 认证模式为 `gateway_trusted` | ✅ | 与 Envoy Gateway OIDC 架构一致 |
| 使用 `accessx.Guard` 做权限编排 | ✅ | `data/data.go` 中创建 `accessx.Guard` |
| 使用 `serverx.ServerMiddlewareFromProviders` | ✅ | `access.go:28` 自动装配 middleware |
| 使用 `securityx.NewRuntime` | ✅ | `access.go:42` 创建 security runtime |
| 使用 `SkipPolicy` 区分公开/认证/授权接口 | ✅ | `access.go:61` 的 `iamSkipPolicyResolver` |
| 不直接操作 Casdoor SDK | ✅ | 通过 Kernel `authn/casdoor` 适配器 |
| 控制面写操作 Actor 来自 ctx | ✅ | PR #29 修复，不再信任请求体 |

**结论：IAM 完全遵循 Kernel 推荐的 Principal 使用范式。** 所有身份信息通过 `authn.PrincipalFromContext(ctx)` 获取，不直接解析 header，认证由 Kernel middleware 自动完成。控制面写操作的 `Owner / CreatedBy / Actor` 统一从 Kernel ctx 获取，不再信任请求体。