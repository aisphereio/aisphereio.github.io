---
title: 资源身份、命名与权限对象规范
sidebar_position: 1
description: 统一 Aisphere 中 Casdoor Organization/Group、Project、Skill、Agent、Sandbox、Git Repository 等资源的不可变标识、技术名称、展示名称和 SpiceDB Object ID 规则。
---

# 资源身份、命名与权限对象规范

## 1. 适用范围

本规范是 Aisphere 平台的强制性架构契约，适用于：

- `aisphere-iam`、`aisphere-iam-frontend`；
- `aisphere-hub`、`aisphere-hub-frontend`；
- 后续 Agent、Tool、Sandbox、Runtime、Git Server 等业务服务；
- PostgreSQL 数据模型、HTTP/gRPC API、事件、审计和 SpiceDB Relationship；
- 与 Casdoor、GitLab/Gitea、S3、Kubernetes 等外部系统的资源映射。

本文中的“必须”“禁止”“只能”表示实现和代码评审必须遵守的约束。

---

## 2. 核心结论

所有资源必须区分以下三类字段：

```text
id            不可变内部资源标识
slug / name   技术标识或外部系统稳定名称
display_name  用户可见展示名称
```

统一规则如下：

| 字段 | 主要用途 | 是否可修改 | 是否作为 SpiceDB Object ID |
|---|---|---:|---:|
| `id` | 数据库主键、事件关联、授权对象、审计关联 | 否 | 是 |
| `slug/name` | URL、CLI、包坐标、外部系统路径或稳定映射 | 首版默认否 | 否 |
| `display_name` | 页面、列表、搜索结果中的展示名称 | 是 | 否 |

必须遵循：

```text
少量稳定角色关系
+
完整且稳定的资源父子关系
=
可继承的权限图
```

平台管理员、组织管理员或项目管理员不应被展开写入每一个下级资源；每个资源必须使用不可变 ID 建立完整父级关系。

---

## 3. SpiceDB Object ID 规范

### 3.1 基本规则

SpiceDB 中资源对象必须使用不可变、唯一且不可复用的标识：

```text
project:<project_id>
skill:<skill_id>
agent:<agent_id>
sandbox:<sandbox_id>
git_repository:<repository_id>
```

禁止使用：

```text
project:<project_slug>
skill:<skill_name>
agent:<display_name>
git_repository:<path_with_namespace>
```

禁止通过以下方式生成 Object ID：

- 对展示名称进行 `slugify`；
- 将中文名称替换为下划线；
- 拼接可变路径；
- 使用邮箱、手机号或用户名作为用户稳定 ID；
- 使用数据库中可能复用的临时序号。

### 3.2 ID 生命周期

资源 ID 必须满足：

1. 创建后永久不可修改；
2. 删除后永久不可复用；
3. 不因重命名、归档、移动或重新发布而变化；
4. 在数据库、事件、日志、审计和 SpiceDB 中含义一致；
5. 客户端不得自行构造或覆盖服务端生成的 ID。

平台自有资源建议使用 UUIDv7 或 ULID。数据库可保留内部自增主键，但必须额外提供稳定的 `resource_id`。

---

## 4. Casdoor Organization 与 Group 的特殊规则

Casdoor 是 Organization、User 和 Group 的事实源。IAM 不复制维护第二套 Organization 或 Group 主数据。

### 4.1 Organization / Zone

Casdoor Organization 映射为 SpiceDB `zone`：

```text
zone:<casdoor_org_stable_key>
```

若当前 Casdoor 接口没有独立、不可变且可稳定获取的 UUID，则：

- `organization.name` 作为外部稳定键；
- `organization.name` 创建后禁止普通修改；
- `organization.display_name` 允许修改；
- SpiceDB `zone` 使用统一规范化后的稳定键；
- 不允许通过请求体覆盖当前 Principal 的 Organization/Zone。

示例：

```yaml
organization:
  name: aisphere
  display_name: Aisphere 人工智能平台
```

修改展示名称不更新 SpiceDB。

### 4.2 Group

Group 的事实源在 Casdoor。若 Casdoor 没有可依赖的独立稳定 ID，则 Group 的 `name` 必须作为外部稳定键冻结使用。

```yaml
group:
  id: IAM/Casdoor 适配层返回的稳定标识
  name: platform-dev
  display_name: 平台开发部
  parent_id: parent-group-id
```

规则：

| 字段 | 约束 |
|---|---|
| `group_id` | SpiceDB Object ID；不可修改 |
| `name` | Casdoor 技术标识；创建后不可修改 |
| `display_name` | 允许修改 |
| `parent_id` | 只能通过独立的 MoveGroup 操作修改 |
| `org_id` | 普通更新接口不得修改 |
| `users` | 不得通过 Group PATCH 整体覆盖 |

SpiceDB 关系示例：

```text
group:<group_id>#zone@zone:<zone_id>
group:<group_id>#parent@group:<parent_group_id>
group:<parent_group_id>#member@group:<group_id>#member
```

IAM 禁止在 Group 重命名时重新生成 slug 或改变 SpiceDB Object ID。

---

## 5. 平台自有资源标准模型

Project、Skill、Agent、Tool、Sandbox、Runtime、Git Namespace、Git Repository 等平台自有资源必须采用统一模型：

```yaml
resource:
  id: immutable UUIDv7/ULID
  slug: immutable technical key
  display_name: mutable human-readable name
  parent_id: immutable except explicit move operation
```

### 5.1 推荐数据库字段

```sql
internal_id BIGSERIAL PRIMARY KEY,
resource_id VARCHAR(36) NOT NULL UNIQUE,
slug VARCHAR(128) NOT NULL,
display_name VARCHAR(255) NOT NULL,
parent_id VARCHAR(36),
created_by VARCHAR(128) NOT NULL,
created_at TIMESTAMPTZ NOT NULL,
updated_at TIMESTAMPTZ NOT NULL
```

根据资源作用域建立唯一约束：

```sql
UNIQUE (zone_id, slug)
UNIQUE (project_id, slug)
UNIQUE (space_id, slug)
```

Repository 层必须明确限制不可变列，普通更新不得写入：

```text
resource_id
slug
parent_id
created_by
created_at
```

---

## 6. API 设计规范

### 6.1 创建接口

创建请求可以接受技术标识和展示名称：

```proto
message CreateResourceRequest {
  string slug = 1;
  string display_name = 2;
  string parent_id = 3;
}
```

服务端负责：

1. 生成不可变资源 ID；
2. 从认证 Principal 或可信父资源推导作用域；
3. 在业务主库落库；
4. 产生父级与创建者关系投影；
5. 返回 ID、slug 和 display_name。

### 6.2 普通更新接口

普通更新只能修改业务展示属性：

```proto
message UpdateResourceRequest {
  string resource_id = 1;
  string display_name = 2;
  string description = 3;
  google.protobuf.FieldMask update_mask = 4;
}
```

普通更新禁止修改：

```text
id
slug/name
parent_id
zone_id
project_id
owner_id
created_by
```

若客户端尝试修改不可变字段，服务端必须返回明确错误：

```text
IMMUTABLE_FIELD
```

不得静默忽略，也不得返回 200。

### 6.3 移动接口

资源父级变化必须使用独立操作：

```proto
rpc MoveResource(MoveResourceRequest) returns (Resource);

message MoveResourceRequest {
  string resource_id = 1;
  string new_parent_id = 2;
}
```

移动操作必须执行：

- 当前资源管理权限检查；
- 目标父资源创建或管理权限检查；
- 作用域兼容性检查；
- 循环关系检查；
- 旧父级关系删除；
- 新父级关系写入；
- 审计记录；
- 幂等和失败恢复。

### 6.4 路由参数

详情、修改、删除、分享和版本操作必须优先使用不可变 ID：

```text
/projects/{project_id}
/skills/{skill_id}
/agents/{agent_id}
/sandboxes/{sandbox_id}
```

可以提供按 slug 解析的读接口：

```text
GET /v1/skills:resolve?project_id=...&slug=document-parser
```

但所有后续写操作和权限检查必须转换为 ID。

---

## 7. 前端交互规范

所有创建和编辑页面必须区分技术标识和展示名称。

### 7.1 创建页

示例：

```text
项目标识：ai-platform
项目名称：人工智能平台
```

技术标识旁必须显示：

```text
创建后不可修改
```

### 7.2 编辑页

编辑页必须展示：

- Resource ID：只读；
- slug/name：只读；
- display_name：可编辑；
- description、标签、Logo 等：按业务允许编辑。

前端隐藏输入框不能替代后端校验。后端必须独立执行不可变字段保护。

### 7.3 组织移动

“修改名称”和“移动到其他父级”必须是两个独立操作：

- 修改名称只改 `display_name`；
- 移动操作单独确认并展示影响范围；
- Group、Project、Skill、Agent、Sandbox 均遵守此规则。

---

## 8. IAM 项目改造约束

### 8.1 IAM 后端

IAM 必须完成：

1. Project 使用不可变 `id` 作为 SpiceDB Object ID；
2. Project `slug` 创建后不可修改；
3. `UpdateProject` 只允许更新 display_name、description、visibility、labels、annotations、metadata；
4. Group 普通更新禁止修改 `name`、`org_id`、`parent_id`、`users`；
5. Group 父级变化拆分为 `MoveGroup`；
6. Group 成员关系只允许通过 Assign/Remove 接口修改；
7. 删除重命名时重新 slugify Group 的逻辑；
8. 对不可变字段返回 `IMMUTABLE_FIELD`；
9. 所有 SpiceDB 投影统一接收 `ResourceRef{Type, ID}`；
10. 增加代码门禁，禁止以 Slug、DisplayName 或路径构造 Relationship。

### 8.2 IAM 前端

IAM 前端必须完成：

- Organization Name 只读，Display Name 可编辑；
- Group Name 只读，Display Name 可编辑；
- Group 移动使用独立操作；
- Project slug 只读，display_name 可编辑；
- 所有详情和权限页使用 Resource ID 调用后端；
- 页面可以展示 slug，但不得将其作为权限对象标识。

---

## 9. Hub 项目改造约束

### 9.1 当前必须消除的耦合

Skill 不得继续把 `name` 同时作为：

- HTTP 路径参数；
- 业务唯一键；
- SkillVersion 外键；
- SkillFile 外键；
- S3 对象路径；
- SpiceDB Object ID；
- 分享与权限对象 ID。

### 9.2 Skill 最终模型

```yaml
skill:
  id: 01JZSKILL...
  slug: document-parser
  display_name: 文档解析助手
  project_id: 01JZPROJECT...
  skill_space_id: 01JZSPACE...
```

SpiceDB：

```text
skill:<skill_id>#parent@skill_space:<skill_space_id>
skill:<skill_id>#owner@user:<creator_id>
```

### 9.3 Hub 后端

Hub 必须完成：

1. Skill 新增不可变 `resource_id`；
2. 将业务 `name` 明确为 `slug`；
3. HTTP 路由从 `{name}` 迁移到 `{skill_id}`；
4. Authz 资源从 `skill:{name}` 迁移到 `skill:{skill_id}`；
5. SkillVersion、SkillFile、Draft、Share、Publish 统一以 `skill_id` 关联；
6. S3 Key 使用 `skill_id`，不得使用 Skill 名称；
7. Skill 更新禁止修改 slug、parent 和 owner；
8. Skill 父级变化使用独立 `MoveSkill`；
9. 创建 Skill 时可靠写入 parent 和 owner 关系；
10. 删除 Skill 时清理其作为 Resource 的全部 Relationship。

推荐 S3 路径：

```text
skills/<skill_id>/versions/<version>/...
```

禁止：

```text
skills/<skill_slug>/versions/<version>/...
```

### 9.4 Hub 前端

Hub 前端必须完成：

- 页面路由改为 `/skills/{skill_id}`；
- 创建页区分 Skill 标识和 Skill 名称；
- 编辑页中 ID、slug 只读，display_name 可修改；
- 版本、文件、草稿、分享全部传递 `skill_id`；
- 页面标题显示 display_name，不以 display_name 定位资源；
- 上传包中的 `name` 只解释为 slug，不允许隐式重命名已有 Skill。

---

## 10. Agent、Sandbox、Git 等后续资源

所有新资源上线前必须定义：

- 不可变 ID；
- 技术 slug/name；
- display_name；
- 唯一父资源；
- SpiceDB resource type；
- 创建者角色；
- 删除和移动语义。

示例：

```text
agent:<agent_id>#parent@agent_space:<space_id>
sandbox:<sandbox_id>#parent@sandbox_space:<space_id>
git_repository:<repository_id>#parent@git_namespace:<namespace_id>
```

Git Repository 还应区分：

```yaml
id: Aisphere 资源 ID
external_id: GitLab/Gitea Repository ID
slug: repository path
path_with_namespace: 外部路径
display_name: 展示名称
```

SpiceDB 不得使用 Git 路径作为 Object ID。

---

## 11. 权限关系与业务字段的边界

下列变化不需要写 SpiceDB：

- display_name；
- description；
- Logo、头像；
- 标签、备注；
- Skill 内容；
- Skill 版本内容；
- Git Commit；
- Agent 配置正文；
- 普通业务元数据。

下列变化需要维护 SpiceDB Relationship：

- 创建权限资源时建立 parent；
- 创建者 owner；
- 移动资源父级；
- Grant/Revoke；
- Group 成员增删；
- Group 父子关系变化；
- 删除资源时清理关系；
- 跨作用域迁移。

平台管理员只需要平台级角色关系：

```text
platform:global#admin@user:<admin_id>
```

不应展开到每一个 Project 或 Skill。权限生效依赖资源完整的父级链。

---

## 12. 一致性与事务分类

### 12.1 不需要外部事务

以下操作只修改单一业务主库：

- 修改 display_name；
- 修改描述、标签、Logo；
- 更新 Skill 内容或版本正文；
- 普通搜索元数据变化。

### 12.2 必须可靠投影

以下操作必须使用本地事务 + Outbox，或纳入 DTM/Saga：

- 创建资源并写 parent/owner；
- 移动资源并替换 parent；
- 删除资源并撤销授权；
- Grant/Revoke；
- Casdoor Group 创建、移动、删除与 SpiceDB 投影；
- Git Repository 创建与外部 Git 服务映射；
- 跨服务资源创建。

普通接口不得直接完成“业务数据库写入后，再 best-effort 写 SpiceDB”的无恢复双写。

### 12.3 安全顺序

删除和禁用优先撤销权限，避免失败开放：

```text
标记 DELETING / 禁止新操作
→
撤销 SpiceDB Relationship
→
删除外部或业务资源
→
标记 DELETED
```

创建失败通常表现为 fail-closed；删除投影滞后可能造成 fail-open，必须优先治理。

---

## 13. 测试和 CI 门禁

### 13.1 后端测试

必须覆盖：

- 修改 display_name 不改变 SpiceDB Relationship；
- 修改 slug/name 返回 `IMMUTABLE_FIELD`；
- 修改 ID 返回 `IMMUTABLE_FIELD`；
- 普通 Update 不允许修改 parent；
- Move 操作正确删除旧 parent 并写入新 parent；
- 创建资源写入 parent 和 owner；
- 删除资源清理其作为 Resource 和 Subject 的关系；
- 重试不会产生重复关系；
- 删除不存在的关系保持幂等。

### 13.2 权限图不变量

每个 ACTIVE 资源必须满足：

```text
Project：恰好一个 zone
SkillSpace：恰好一个 project parent
Skill：恰好一个 skill_space parent
Agent：恰好一个 agent_space parent
Sandbox：恰好一个 sandbox_space parent
Group：恰好一个 zone
非根 Group：恰好一个 parent
```

必须有漂移检查和修复能力，至少监控：

- missing relationships；
- orphan relationships；
- multiple parents；
- projection failed；
- retry backlog；
- immutable-field violation。

### 13.3 前端测试

必须覆盖：

- 编辑页不提供 slug/name 可编辑输入框；
- ID 与技术标识只读；
- display_name 可修改；
- 移动操作与重命名分离；
- API 路由使用 Resource ID；
- Skill 分享和版本请求使用 Skill ID。

---

## 14. 迁移策略

Aisphere 当前未正式上线的模块优先采用破坏性迁移，不长期维护双标识兼容。

### 14.1 IAM

1. 固化 Group name；
2. 拆分 UpdateGroup 与 MoveGroup；
3. 清理测试 Group 和错误投影；
4. 重新从 Casdoor 投影 Group；
5. 校验所有 Project Relationship 使用 Project ID。

### 14.2 Hub

1. 停止写入测试环境；
2. 为 Skill 引入稳定资源 ID；
3. 将版本、文件、草稿和分享迁移到 Skill ID；
4. 重构 HTTP 路由和 Authz Resource；
5. 将 S3 Key 切换到 Skill ID；
6. 清理旧 Skill Relationship；
7. 重新创建 Project、SkillSpace 和 Skill；
8. 验证 Project 角色可以继承到 Skill。

不得为了旧的 `skill:{name}` 或名称型 Relationship 建立长期兼容层。

---

## 15. 代码评审检查表

提交涉及资源模型、API 或权限关系时，评审者必须确认：

- [ ] 是否存在不可变资源 ID；
- [ ] SpiceDB 是否只使用不可变 ID；
- [ ] slug/name 是否与 display_name 分离；
- [ ] Update API 是否排除 ID、slug、parent；
- [ ] 父级变化是否使用独立 Move API；
- [ ] 创建是否写入完整 parent；
- [ ] 创建者 owner 是否符合产品策略；
- [ ] 删除是否清理 Relationship；
- [ ] 外部系统 ID 是否作为 `external_id` 保存；
- [ ] 是否提供幂等键、Outbox、重试和审计；
- [ ] 是否增加不可变字段和权限图不变量测试。

---

## 16. 标准示例

```yaml
project:
  id: 01JZPROJECT123
  slug: ai-platform
  display_name: 人工智能平台

skill:
  id: 01JZSKILL456
  slug: document-parser
  display_name: 文档解析助手
```

SpiceDB：

```text
project:01JZPROJECT123#zone@zone:aisphere
skill_space:01JZSPACE789#parent@project:01JZPROJECT123
skill:01JZSKILL456#parent@skill_space:01JZSPACE789
skill:01JZSKILL456#owner@user:01JZUSER001
```

将“文档解析助手”修改为“企业文档解析平台”时，上述 Relationship 不发生任何变化。

---

## 17. 最终强制规则

```text
1. SpiceDB 只使用不可变 Resource ID。
2. display_name 永远不能作为主键或权限标识。
3. slug/name 首版创建后不可修改。
4. Casdoor 缺少独立稳定 ID 时，其 name 作为冻结的外部稳定键。
5. 普通 Update API 不允许修改 ID、slug/name 和 parent。
6. 资源移动必须使用独立 Move API。
7. 权限检查和授权写入必须基于 ID，不基于 URL、名称或路径。
8. 创建权限资源必须产生完整父级关系。
9. 删除资源必须清理其作为 Resource 和 Subject 的关系。
10. 新资源类型上线前必须通过身份稳定性和关系完整性测试。
```
