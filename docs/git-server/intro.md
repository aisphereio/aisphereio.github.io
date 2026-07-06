---
sidebar_position: 1
---

# Aisphere Git Server

Aisphere Git Server 是基于 `github.com/aisphereio/kernel` 的 Git 服务，支持技能版本化存储。

## 概述

Git Server 为 Aisphere 平台提供 Git 仓库管理能力，使技能和配置可以像代码一样进行版本管理。

## 本地开发

```powershell
make tools-local KERNEL_LOCAL=../kernel
make api
make proto-check
make test
make run
```

## 依赖

- `github.com/aisphereio/kernel` — 核心框架