---
sidebar_position: 3
title: 启动管理员配置
---

# 启动管理员配置（Bootstrap Admins）

## 概述

IAM 服务启动时，可以通过 `control_plane.bootstrap_admins` 配置自动在 SpiceDB 中创建管理员权限关系。这样指定的用户在首次部署后就能直接访问 IAM 控制台，无需手动授权。

## 配置方式

在 IAM 的 `config.yaml` 中配置：

```yaml
control_plane:
  bootstrap_admins:
    enabled: true
    subjects:
      - casdoor_org: aisphere        # Casdoor 组织名称
        username: admin              # Casdoor 用户名（bootstrap 会自动查询其 UUID）
        zone_id: aisphere            # SpiceDB zone 资源 ID（通常与 Casdoor 组织一致）
        role: zone_owner             # 角色：zone_owner / zone_admin / user_viewer 等
        type: user                   # 主体类型
        source: bootstrap
        reason: initial Casdoor admin user
```

## 配置字段说明

| 字段 | 必填 | 说明 |
|------|------|------|
| `enabled` | 是 | 是否启用启动管理员 |
| `subjects[].casdoor_org` | 推荐 | Casdoor 组织名称，用于查找用户 |
| `subjects[].username` | 推荐 | Casdoor 用户名，bootstrap 会自动查询用户的真实 UUID |
| `subjects[].zone_id` | 推荐 | SpiceDB 中 zone 资源的 ID，通常与 Casdoor 组织一致 |
| `subjects[].role` | 是 | 角色，映射为 SpiceDB zone 的 relation |
| `subjects[].type` | 是 | 主体类型：`user` / `service` / `service_account` |
| `subjects[].id` | 备选 | 直接指定 SpiceDB subject ID（不推荐，建议用 `username`） |
| `subjects[].source` | 否 | 来源标记 |
| `subjects[].reason` | 否 | 原因说明 |

### 角色映射

| 配置值 | SpiceDB 关系 | 权限 |
|--------|-------------|------|
| `zone_owner` / `owner` | `owner` | 完全控制 zone 及所有控制面资源 |
| `zone_admin` / `admin` | `admin` | 管理 zone 及控制面资源 |
| `user_viewer` | `user_viewer` | 查看用户列表 |
| `user_manager` | `user_manager` | 管理用户 |
| `group_viewer` | `group_viewer` | 查看组列表 |
| `group_manager` | `group_manager` | 管理组 |
| `permission_admin` | `permission_admin` | 管理权限 |

## 工作原理

### 启动流程

1. IAM 服务启动，读取 `bootstrap_admins` 配置
2. 对于每个配置了 `username` 的主体，通过 Casdoor API 查询用户的真实 UUID
3. 在 SpiceDB 中写入以下关系：

```
# zone 权限
zone:{zone_id}#{role}@user:{user_uuid}

# 控制面资源管理权限（仅 role=owner/admin 时）
iam:organization#admin@user:{user_uuid}
iam:capability#admin@user:{user_uuid}
iam:resource_type#admin@user:{user_uuid}
iam:resource#admin@user:{user_uuid}
iam:resource_binding#admin@user:{user_uuid}
iam:external_resource_binding#admin@user:{user_uuid}
iam:role_template#admin@user:{user_uuid}
iam:grant#admin@user:{user_uuid}
iam_authz:global#admin@user:{user_uuid}
```

### 2. 幂等性

Bootstrap 使用 SpiceDB 的 `OPERATION_TOUCH`（upsert 语义），每次启动都会执行，但不会重复创建已存在的关系。

## 常见问题

### Q: 为什么用 `username` 而不是 `id`？

Casdoor 中用户的真实 ID 是 UUID 格式（如 `b22888d1-5cd0-4700-8e67-aa4a622fd715`），而 `id: admin` 会直接使用字符串 `"admin"` 作为 SpiceDB subject ID，与实际用户的 UUID 不匹配，导致权限检查失败。

**正确配置：**
```yaml
# ✅ 正确：通过 username 查询真实 UUID
- username: admin
  zone_id: aisphere
  role: zone_owner
```

**错误配置：**
```yaml
# ❌ 错误：id 是字符串 "admin"，不是真实 UUID
- id: admin
  zone_id: aisphere
  role: zone_owner
```

### 2. 如何验证配置生效

查看 IAM 启动日志：
```
level=info message="control plane admin relationships bootstrapped" written=10
```

`written=10` 表示写入了 10 条关系（1 条 zone owner + 9 条控制面资源 admin）。

### 3. 部署到 K8s

如果使用 ConfigMap 部署，需要将 `bootstrap_admins` 配置添加到 ConfigMap 的 `config.yaml` 中：

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: aisphere-iam-config
  namespace: aisphere
data:
  config.yaml: |
    control_plane:
      bootstrap_admins:
        enabled: true
        subjects:
          - casdoor_org: aisphere
            username: admin
            zone_id: aisphere
            role: zone_owner
            source: bootstrap
            reason: initial Casdoor admin user
    # ... 其他配置
```

更新 ConfigMap 后重启 IAM：

```bash
kubectl rollout restart deployment/aisphere-iam -n aisphere
```