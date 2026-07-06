---
sidebar_position: 2
title: 本地开发环境
---

# Aisphere Local Stack

## Middleware

| Component | Endpoint |
| --- | --- |
| Casdoor | `http://36.137.200.194:30082` |
| SpiceDB gRPC | `36.137.200.194:30084` |
| SpiceDB HTTP | `http://36.137.200.194:30087` |
| PostgreSQL | `36.137.200.194:30080` |
| Redis | `36.137.200.194:30085` |
| etcd | `36.137.200.194:30086` |

## 启动顺序

在每个 PowerShell 窗口中分别启动服务：

```powershell
cd E:\coding\aisphereio
.\scripts\start-iam.ps1
```

```powershell
cd E:\coding\aisphereio
.\scripts\start-gateway.ps1
```

```powershell
cd E:\coding\aisphereio
.\scripts\start-hub.ps1
```

```powershell
cd E:\coding\aisphereio
.\scripts\start-hub-front.ps1
```

一键启动所有服务：

```powershell
cd E:\coding\aisphereio
.\scripts\start-stack.ps1
```

## 端口

| Service | HTTP | gRPC | Metrics |
| --- | --- | --- | --- |
| IAM | `18080` | `19080` | `19180` |
| Gateway | `18000` | `19000` | `19100` |
| Hub | `18001` | `19001` | `19090` |
| Hub Front | `3000` | - | - |

## 健康检查

```powershell
curl.exe -i http://127.0.0.1:18080/healthz
curl.exe -i http://127.0.0.1:18000/healthz
curl.exe -i http://127.0.0.1:18001/healthz
```

```powershell
curl.exe -G "http://127.0.0.1:18080/v1/iam/login-url" --data-urlencode "redirect_uri=http://localhost:18000/callback"
curl.exe -G "http://127.0.0.1:18000/v1/iam/login-url" --data-urlencode "redirect_uri=http://localhost:18000/callback"
curl.exe -s http://127.0.0.1:18000/v1/gateway/routes
curl.exe -i http://127.0.0.1:18001/v1/skills
```