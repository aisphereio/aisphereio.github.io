---
title: 贡献指南
---

# 贡献指南

## 报告 Bug

使用 GitHub issues 管理问题。提交前请先搜索已有 issues、pull requests 并阅读 [FAQ](https://aisphereio.dev/docs/intro/faq)。

## 添加新功能

通过 proposal 流程征求社区意见：

1. **Proposal** — 在 issue 中描述功能需求和参考资料
2. **Feature** — 社区同意后创建 feature issue，描述实现方法和功能演示
3. **PR** — 实现后发起 PR，关联 proposal issue 和 feature issue

## 提交代码

1. Fork 项目到你的 GitHub 账户
2. 基于 main 分支创建 feature 分支（如 `feature-log`）
3. 编写代码
4. 提交到远端分支
5. 提交 PR
6. 等待 review 并合并到 main

## Conventional Commits

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Type

- **fix**: Bug 修复
- **feat**: 新功能
- **deps**: 外部依赖变更
- **break**: 破坏性变更
- **docs**: 文档
- **refactor**: 重构
- **style**: 格式
- **test**: 测试
- **chore**: 日常维护
- **ci**: CI 配置

### Scope

- transport, examples, middleware, config, cmd 等