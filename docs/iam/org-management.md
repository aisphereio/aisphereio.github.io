---
sidebar_position: 2
title: 组织管理
---

# 组织管理（Organization Management）实现文档

## 概述

组织（Organization）是 IAM 控制平面中的租户根对象，类似于 Kubernetes 的 Namespace。它是资源隔离和权限管理的顶层实体，所有项目（Project）、资源（Resource）和授权（Grant）都归属于某个组织。

## 架构总览

```
┌─ Frontend (React/Next.js) ─────────────────────────────────────┐
│  iam-page.tsx (OrganizationsTab)                                │
│    → use-iam.ts (React Query hooks)                             │
│      → api/index.ts (HTTP client)                              │
│        → HTTP POST/GET/PATCH /v1/iam/control-plane/orgs/*      │
└────────────────────────────────────────────────────────────────┘
                          │ HTTP/REST + JSON
                          ▼
┌─ Backend (Go) ─────────────────────────────────────────────────┐
│  control_plane.go (gRPC handlers / ProjectService)             │
│    → biz/project/service.go (Business logic)                   │
│      → data/resource_repository.go (Repository interface)      │
│        → data/resource_repository.go (DBControlPlaneRepository)│
│          → dbx.DB (PostgreSQL via GORM)                        │
│    → projection.Manager (SpiceDB authz relationship writes)    │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─ Database ─────────────────────────────────────────────────────┐
│  PostgreSQL: iam_organizations table                           │
│  SpiceDB:     authz relationships (organization#owner)            │
└────────────────────────────────────────────────────────────────┘
```

## 数据模型

### 数据库表

```sql
CREATE TABLE IF NOT EXISTS iam_organizations (
  id            text PRIMARY KEY,
  slug          text NOT NULL UNIQUE,
  display_name  text NOT NULL,
  status        text NOT NULL,
  casdoor_org   text,
  plan          text,
  region        text,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
```

### Go 模型

```go
type OrganizationModel struct {
    ID           string    `gorm:"column:id;primaryKey"`
    Slug         string    `gorm:"column:slug;uniqueIndex;not null"`
    DisplayName  string    `gorm:"column:display_name;not null"`
    Status       string    `gorm:"column:status;not null"`
    CasdoorOrg   string    `gorm:"column:casdoor_org"`
    Plan         string    `gorm:"column:plan"`
    Region       string    `gorm:"column:region"`
    MetadataJSON string    `gorm:"column:metadata_json;type:jsonb;default:'{}'"`
    CreatedAt    time.Time `gorm:"column:created_at;autoCreateTime"`
    UpdatedAt    time.Time `gorm:"column:updated_at;autoUpdateTime"`
}
```

### 状态常量

| 常量 | 值 | 说明 |
|---|---|---|
| `StatusActive` | `"active"` | 正常 |
| `StatusArchived` | `"archived"` | 已归档（软删除） |
| `StatusDeleted` | `"deleted"` | 已删除 |

## Protobuf 定义

### 服务接口

```protobuf
service ProjectService {
  rpc CreateOrganization(CreateOrganizationRequest) returns (Organization) {
    option (google.api.http) = { post: "/v1/iam/control-plane/orgs" body: "*" };
  }
  rpc GetOrganization(GetOrganizationRequest) returns (Organization) {
    option (google.api.http) = { get: "/v1/iam/control-plane/orgs/{org_id}" };
  }
  rpc ListOrganizations(ListOrganizationsRequest) returns (ListOrganizationsReply) {
    option (google.api.http) = { get: "/v1/iam/control-plane/orgs" };
  }
  rpc UpdateOrganization(UpdateOrganizationRequest) returns (Organization) {
    option (google.api.http) = { patch: "/v1/iam/control-plane/orgs/{org_id}" body: "*" };
  }
  rpc ArchiveOrganization(ArchiveOrganizationRequest) returns (Organization) {
    option (google.api.http) = { post: "/v1/iam/control-plane/orgs/{org_id}/archive" body: "*" };
  }
}
```

## 后端实现

### 分层架构

```
┌─────────────────────────────────────────────────────────────┐
│  Service Layer (control_plane.go)                           │
│  - gRPC handler: 接收 proto 请求 → 调用 biz → 返回 proto 响应 │
├─────────────────────────────────────────────────────────────┤
│  Biz Layer (biz/project/service.go)                         │
│  - 业务逻辑：验证、默认值、状态转换、投影事件调度               │
├─────────────────────────────────────────────────────────────┤
│  Data Layer (data/resource_repository.go)                   │
│  - Repository 接口定义 + DBControlPlaneRepository 实现       │
└─────────────────────────────────────────────────────────────┘
```

## 前端实现

### API 客户端

```typescript
export const iamProjectApi = {
  createOrganization: (org) =>
    iamRequest<IamCpOrganization>('/v1/iam/control-plane/orgs', { method: 'POST', body: JSON.stringify(org) }),
  getOrganization: (orgId) =>
    iamRequest<IamCpOrganization>(`/v1/iam/control-plane/orgs/${encodeURIComponent(orgId)}`),
  listOrganizations: () =>
    iamRequest<{ organizations: IamCpOrganization[] }>('/v1/iam/control-plane/orgs'),
  updateOrganization: (orgId, org) =>
    iamRequest<IamCpOrganization>(`/v1/iam/control-plane/orgs/${encodeURIComponent(orgId)}`, { method: 'PATCH', body: JSON.stringify(org) }),
  archiveOrganization: (orgId) =>
    iamRequest<{ success: boolean }>(`/v1/iam/control-plane/orgs/${encodeURIComponent(orgId)}/archive`, { method: 'POST' }),
};
```

### React Hooks

| Hook | Query Key | 说明 |
|------|-----------|------|
| `useIamOrganizations()` | `['iam', 'organizations']` | 获取组织列表 |
| `useIamOrganization(orgId)` | `['iam', 'organization', orgId]` | 获取单个组织 |
| `useIamCreateOrganization()` | 失效 `['iam', 'organizations']` | 创建组织 |
| `useIamUpdateOrganization()` | 失效 `['iam', 'organizations']` | 更新组织 |
| `useIamArchiveOrganization()` | 失效 `['iam', 'organizations']` | 归档组织 |