---
sidebar_position: 1
---

# Aisphere IAM

Aisphere IAM 是基于 `github.com/aisphereio/kernel` 的**身份认证、目录查询和权限关系服务**。它封装 Casdoor（认证）和 SpiceDB（授权），为 Hub、Gateway、Runtime 等业务组件提供统一 IAM API。

## 架构

```text
外部请求
  -> HTTP / gRPC server
  -> IAMAuthService   (登录、令牌管理、用户信息)
  -> IAMDirectoryService (用户、组织、组目录查询)
  -> IAMPermissionService (权限检查、关系写入、资源/主体查找)
  -> Casdoor (认证后端)
  -> SpiceDB (授权后端)
```

## 提供的服务

### IAMAuthService

| 方法 | 说明 |
|------|------|
| `BuildLoginURL` | 构建 Casdoor 登录 URL |
| `ExchangeCode` | 用 code 交换 token |
| `RefreshToken` | 刷新令牌 |
| `VerifyToken` | 验证令牌 |
| `RevokeToken` | 撤销令牌 |
| `GetMe` | 获取当前用户信息 |
| `UpdateMe` | 更新当前用户信息 |
| `GetUserPreferences` | 获取用户偏好 |
| `UpdateUserPreferences` | 更新用户偏好 |

### IAMDirectoryService

| 方法 | 说明 |
|------|------|
| `GetUser` | 获取用户 |
| `ListUsers` | 列出用户 |
| `GetOrganization` | 获取组织 |
| `ListGroups` | 列出组 |

### IAMPermissionService

| 方法 | 说明 |
|------|------|
| `CheckPermission` | 检查权限 |
| `WriteRelationship` | 写入关系 |
| `DeleteRelationship` | 删除关系 |
| `LookupResources` | 查找资源 |
| `LookupSubjects` | 查找主体 |

## 本地运行

```powershell
go run ./cmd/aisphere-iam -conf ./configs/config.local.yaml
```

默认端口：

- HTTP: `0.0.0.0:18080`
- gRPC: `0.0.0.0:19080`
- Metrics: `127.0.0.1:19180`

## 验证

```bash
# 健康检查
curl http://127.0.0.1:18080/healthz

# 获取登录 URL
curl "http://127.0.0.1:18080/v1/iam/login-url?redirect_uri=http://localhost:3001/auth/callback&state=/"

# 列出本地用户
curl http://127.0.0.1:18080/v1/users

# 创建本地用户
curl -X POST http://127.0.0.1:18080/v1/users \
  -H "Content-Type: application/json" \
  -d '{"username":"test","displayName":"Test User","email":"test@example.com","password":"test123"}'
```

## 依赖

- `github.com/aisphereio/kernel` — 核心框架
- Casdoor — 身份认证
- SpiceDB — 关系授权
- etcd — route registry 存储（可选）