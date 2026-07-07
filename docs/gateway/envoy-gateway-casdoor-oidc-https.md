---
title: Envoy Gateway + Casdoor OIDC HTTPS 部署方案
sidebar_position: 20
---

# Envoy Gateway + cert-manager + AliDNS + Casdoor OIDC HTTPS 部署方案

本文档用于部署 Aisphere 平台的 HTTPS 网关与 OIDC 登录链路。

目标是：

```text
外部用户
  -> https://casdoor.weagent.cc
  -> https://api.weagent.cc/v1/iam
  -> HAProxy 443 TCP 透传
  -> Kubernetes NodePort 30723
  -> Envoy Gateway HTTPS listener
  -> HTTPRoute
  -> Casdoor / Aisphere IAM
```

## 1. 目标地址

| 组件 | 地址 |
|---|---|
| Casdoor | `https://casdoor.weagent.cc` |
| IAM API | `https://api.weagent.cc/v1/iam` |
| OIDC Callback | `https://api.weagent.cc/v1/iam/oauth2/callback` |
| Gateway HTTPS NodePort | `30723` |
| TLS Secret | `aisphere/weagent-cc-tls` |
| 证书域名 | `weagent.cc`, `*.weagent.cc` |

当前方案里，外部统一访问标准 HTTPS 443，不暴露 NodePort 端口。前端 HAProxy 只做 **TCP passthrough**，TLS 仍然在 Envoy Gateway 终止。

## 2. 安全要求

不要把阿里云 AccessKey 明文写入 Git、文档、聊天记录、CI 日志或脚本固定值。

推荐使用：

```bash
export ALIDNS_ACCESS_KEY_ID='<your-access-key-id>'
export ALIDNS_ACCESS_KEY_SECRET='<your-access-key-secret>'
```

如果 AccessKey 已经泄露，需要立即在阿里云控制台禁用或轮换，并重新创建最小权限 RAM 用户。

## 3. 前置条件

### 3.1 Kubernetes 资源

确认已有：

```bash
kubectl get ns
kubectl get gateway -n aisphere
kubectl get svc -n aisphere
kubectl get svc -n envoy-gateway-system
```

关键资源：

```text
Namespace:
  aisphere
  cert-manager
  envoy-gateway-system

Gateway:
  aisphere/aisphere-gateway

Service:
  aisphere/casdoor       port 8000
  aisphere/aisphere-iam  port 18080
```

### 3.2 DNS 解析

在阿里云 DNS 中配置：

```text
casdoor.weagent.cc  A  <HAProxy 公网 IP>
api.weagent.cc      A  <HAProxy 公网 IP>
```

也可以使用泛域名：

```text
*.weagent.cc        A  <HAProxy 公网 IP>
```

验证：

```bash
dig +short casdoor.weagent.cc
dig +short api.weagent.cc
```

## 4. 安装 cert-manager run 包

安装包示例位置：

```text
/root/cert-manager-1.20.3-amd64.run
```

执行安装：

```bash
chmod +x /root/cert-manager-1.20.3-amd64.run

/root/cert-manager-1.20.3-amd64.run install \
  --registry sealos.hub:5000/kube4 \
  -n cert-manager \
  --alidns-domain weagent.cc \
  --alidns-access-key-id "${ALIDNS_ACCESS_KEY_ID}" \
  --alidns-access-key-secret "${ALIDNS_ACCESS_KEY_SECRET}" \
  --alidns-email admin@weagent.cc \
  --alidns-prod \
  -y
```

检查：

```bash
kubectl get pods -n cert-manager
kubectl get clusterissuer
kubectl describe clusterissuer letsencrypt-dns01-prod
```

期望：

```text
cert-manager             Running
cert-manager-cainjector  Running
cert-manager-webhook     Running
alidns-webhook           Running
ClusterIssuer            Ready=True
```

## 5. 在 aisphere namespace 创建证书

如果证书 Secret 当前在 `default/weagent-cc-tls`，不要手动复制到 `aisphere`。应在 `aisphere` namespace 创建 `Certificate`，让 cert-manager 自动管理续期。

```bash
cat <<'EOF' | kubectl apply -f -
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: weagent-cc
  namespace: aisphere
spec:
  secretName: weagent-cc-tls
  issuerRef:
    name: letsencrypt-dns01-prod
    kind: ClusterIssuer
  dnsNames:
    - weagent.cc
    - "*.weagent.cc"
EOF
```

检查：

```bash
kubectl get certificate -n aisphere
kubectl describe certificate -n aisphere weagent-cc
kubectl get secret -n aisphere weagent-cc-tls
```

期望：

```text
Certificate Ready=True
Secret aisphere/weagent-cc-tls exists
Secret type: kubernetes.io/tls
```

排查签发过程：

```bash
kubectl get certificaterequest -n aisphere
kubectl get order -n aisphere
kubectl get challenge -n aisphere
kubectl describe challenge -n aisphere
```

## 6. 配置 Envoy Gateway HTTPS listener

备份 Gateway：

```bash
kubectl get gateway -n aisphere aisphere-gateway -o yaml > /root/aisphere-gateway.backup.yaml
```

查看当前 listener：

```bash
kubectl get gateway -n aisphere aisphere-gateway \
  -o jsonpath='{range .spec.listeners[*]}{.name}{" "}{.protocol}{" "}{.port}{"\n"}{end}'
```

如果没有 `https` listener，追加：

```bash
kubectl patch gateway -n aisphere aisphere-gateway --type=json -p='[
  {
    "op": "add",
    "path": "/spec/listeners/-",
    "value": {
      "name": "https",
      "hostname": "*.weagent.cc",
      "port": 443,
      "protocol": "HTTPS",
      "tls": {
        "mode": "Terminate",
        "certificateRefs": [
          {
            "group": "",
            "kind": "Secret",
            "name": "weagent-cc-tls"
          }
        ]
      },
      "allowedRoutes": {
        "namespaces": {
          "from": "Same"
        }
      }
    }
  }
]'
```

检查 Gateway 状态：

```bash
kubectl get gateway -n aisphere aisphere-gateway -o yaml
```

确认 Envoy Gateway Service 有 HTTPS NodePort：

```bash
kubectl get svc -n envoy-gateway-system | grep aisphere-gateway
```

当前 HTTPS NodePort：

```text
443:30723/TCP
```

## 7. 配置 HAProxy 443 TCP 透传

HAProxy 前端统一监听 443，后端转发到 Kubernetes NodePort `30723`。

这种方式下，TLS 不在 HAProxy 终止，证书仍由 Envoy Gateway 使用 `aisphere/weagent-cc-tls` 终止。

### 7.1 单节点后端示例

```haproxy
global
    log /dev/log local0
    log /dev/log local1 notice
    daemon
    maxconn 4096

defaults
    log global
    mode tcp
    option tcplog
    timeout connect 10s
    timeout client  1m
    timeout server  1m

frontend fe_https
    bind *:443
    mode tcp
    default_backend be_envoy_gateway_https

backend be_envoy_gateway_https
    mode tcp
    balance roundrobin
    server k8s-node-1 <K8S_NODE_INTERNAL_IP>:30723 check
```

### 7.2 多节点后端示例

```haproxy
global
    log /dev/log local0
    log /dev/log local1 notice
    daemon
    maxconn 4096

defaults
    log global
    mode tcp
    option tcplog
    timeout connect 10s
    timeout client  1m
    timeout server  1m

frontend fe_https
    bind *:443
    mode tcp
    default_backend be_envoy_gateway_https

backend be_envoy_gateway_https
    mode tcp
    balance roundrobin
    server k8s-node-1 <K8S_NODE_1_INTERNAL_IP>:30723 check
    server k8s-node-2 <K8S_NODE_2_INTERNAL_IP>:30723 check
    server k8s-node-3 <K8S_NODE_3_INTERNAL_IP>:30723 check
```

检查配置：

```bash
haproxy -c -f /etc/haproxy/haproxy.cfg
systemctl restart haproxy
systemctl status haproxy --no-pager
```

测试 443：

```bash
curl -vk https://casdoor.weagent.cc/
```

## 8. 配置 Casdoor HTTPS HTTPRoute

```bash
cat <<'EOF' | kubectl apply -f -
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: casdoor-public-http
  namespace: aisphere
spec:
  parentRefs:
    - group: gateway.networking.k8s.io
      kind: Gateway
      name: aisphere-gateway
      sectionName: https
  hostnames:
    - casdoor.weagent.cc
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /
      backendRefs:
        - group: ""
          kind: Service
          name: casdoor
          port: 8000
EOF
```

检查：

```bash
kubectl get httproute -n aisphere casdoor-public-http -o yaml
curl -vk https://casdoor.weagent.cc/
```

## 9. 修改 Casdoor 主站地址

由于 HAProxy 已经把公网 443 转到 NodePort 30723，外部标准地址不再带端口。

设置 Casdoor：

```bash
kubectl -n aisphere set env deployment/casdoor \
  origin='https://casdoor.weagent.cc' \
  originFrontend='https://casdoor.weagent.cc'

kubectl -n aisphere rollout restart deployment/casdoor
kubectl -n aisphere rollout status deployment/casdoor
```

验证：

```bash
kubectl -n aisphere exec deploy/casdoor -- printenv | grep -E 'origin|originFrontend'
```

验证 OIDC metadata：

```bash
curl -sk https://casdoor.weagent.cc/.well-known/openid-configuration \
  | jq -r '.issuer,.authorization_endpoint,.token_endpoint,.jwks_uri'
```

期望：

```text
https://casdoor.weagent.cc
https://casdoor.weagent.cc/login/oauth/authorize
https://casdoor.weagent.cc/api/login/oauth/access_token
https://casdoor.weagent.cc/.well-known/jwks
```

## 10. 配置 IAM HTTPS HTTPRoute

```bash
cat <<'EOF' | kubectl apply -f -
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: iam-http
  namespace: aisphere
spec:
  parentRefs:
    - group: gateway.networking.k8s.io
      kind: Gateway
      name: aisphere-gateway
      sectionName: https
  hostnames:
    - api.weagent.cc
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /v1/iam
      backendRefs:
        - group: ""
          kind: Service
          name: aisphere-iam
          port: 18080
EOF
```

健康检查单独公开，不挂 OIDC：

```bash
cat <<'EOF' | kubectl apply -f -
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: iam-health-http
  namespace: aisphere
spec:
  parentRefs:
    - group: gateway.networking.k8s.io
      kind: Gateway
      name: aisphere-gateway
      sectionName: https
  hostnames:
    - api.weagent.cc
  rules:
    - matches:
        - path:
            type: Exact
            value: /healthz
      backendRefs:
        - group: ""
          kind: Service
          name: aisphere-iam
          port: 18080
EOF
```

验证：

```bash
kubectl get httproute -n aisphere
curl -vk https://api.weagent.cc/healthz
```

## 11. 配置 Casdoor 应用 Redirect URL

进入 Casdoor：

```text
https://casdoor.weagent.cc
```

找到应用：

```text
aisphere-iam
```

添加 Redirect URL：

```text
https://api.weagent.cc/v1/iam/oauth2/callback
```

注意：由于 HAProxy 已统一外部端口为 443，这里不再带 `:30723`。

## 12. 创建 IAM OIDC Client Secret

不要把真实 client secret 写入文档。

```bash
export CASDOOR_CLIENT_SECRET='<casdoor-client-secret>'

kubectl -n aisphere create secret generic casdoor-oidc-client-secret \
  --from-literal=client-secret="${CASDOOR_CLIENT_SECRET}" \
  --dry-run=client -o yaml | kubectl apply -f -
```

验证：

```bash
kubectl get secret -n aisphere casdoor-oidc-client-secret
```

## 13. 创建 IAM OIDC SecurityPolicy

```bash
cat <<'EOF' | kubectl apply -f -
apiVersion: gateway.envoyproxy.io/v1alpha1
kind: SecurityPolicy
metadata:
  name: iam-oidc
  namespace: aisphere
spec:
  targetRefs:
    - group: gateway.networking.k8s.io
      kind: HTTPRoute
      name: iam-http
  oidc:
    provider:
      issuer: "https://casdoor.weagent.cc"
    clientID: "<casdoor-client-id>"
    clientSecret:
      name: casdoor-oidc-client-secret
    redirectURL: "https://api.weagent.cc/v1/iam/oauth2/callback"
    logoutPath: "/v1/iam/logout"
    scopes:
      - openid
      - profile
      - email
    refreshToken: true
    forwardAccessToken: true
EOF
```

检查：

```bash
kubectl get securitypolicy -n aisphere
kubectl get securitypolicy -n aisphere iam-oidc -o yaml
kubectl describe securitypolicy -n aisphere iam-oidc
```

期望：

```text
Accepted=True
Programmed=True
```

## 14. 集群内部 DNS 一致性

Envoy Gateway 在集群内部也需要访问：

```text
https://casdoor.weagent.cc/.well-known/openid-configuration
https://casdoor.weagent.cc/.well-known/jwks
```

如果集群内部访问公网 IP 不通，需要让 CoreDNS 把域名解析到 HAProxy 内网 IP 或 Kubernetes Node 内网 IP。

查看 Node 内网 IP：

```bash
kubectl get nodes -o wide
```

编辑 CoreDNS：

```bash
kubectl -n kube-system edit configmap coredns
```

示例：

```text
hosts {
  <HAPROXY_OR_NODE_INTERNAL_IP> casdoor.weagent.cc
  <HAPROXY_OR_NODE_INTERNAL_IP> api.weagent.cc
  fallthrough
}
```

重启 CoreDNS：

```bash
kubectl -n kube-system rollout restart deployment/coredns
kubectl -n kube-system rollout status deployment/coredns
```

验证：

```bash
kubectl run dns-check \
  -n aisphere \
  --rm -it \
  --image=busybox:1.36 \
  --restart=Never \
  -- nslookup casdoor.weagent.cc
```

验证集群内 HTTPS：

```bash
kubectl run casdoor-check \
  -n aisphere \
  --rm -it \
  --image=curlimages/curl \
  --restart=Never \
  -- \
  curl -vk https://casdoor.weagent.cc/.well-known/openid-configuration
```

## 15. 最终验证

### 15.1 Casdoor 页面

```bash
curl -vk https://casdoor.weagent.cc/
```

浏览器访问：

```text
https://casdoor.weagent.cc
```

应该能正常打开 Casdoor，静态资源不应 404。

### 15.2 OIDC discovery

```bash
curl -sk https://casdoor.weagent.cc/.well-known/openid-configuration | jq .
```

重点检查：

```bash
curl -sk https://casdoor.weagent.cc/.well-known/openid-configuration \
  | jq -r '.issuer,.authorization_endpoint,.token_endpoint,.jwks_uri'
```

必须是：

```text
https://casdoor.weagent.cc
https://casdoor.weagent.cc/login/oauth/authorize
https://casdoor.weagent.cc/api/login/oauth/access_token
https://casdoor.weagent.cc/.well-known/jwks
```

### 15.3 IAM healthz

```bash
curl -vk https://api.weagent.cc/healthz
```

应直接返回健康检查结果，不应跳登录。

### 15.4 IAM OIDC 拦截

```bash
curl -vk https://api.weagent.cc/v1/iam
```

成功现象：

```text
HTTP/2 302
location: https://casdoor.weagent.cc/login/oauth/authorize?...
```

浏览器访问：

```text
https://api.weagent.cc/v1/iam
```

应跳转到 Casdoor 登录页，登录后回调：

```text
https://api.weagent.cc/v1/iam/oauth2/callback
```

## 16. 常见问题

### 16.1 `/v1/iam` 没有跳转 Casdoor

检查：

```bash
kubectl get securitypolicy -n aisphere iam-oidc -o yaml
kubectl describe securitypolicy -n aisphere iam-oidc
kubectl get httproute -n aisphere iam-http -o yaml
```

重点确认：

```text
SecurityPolicy targetRefs -> HTTPRoute iam-http
HTTPRoute parentRefs -> Gateway sectionName https
HTTPRoute hostname -> api.weagent.cc
```

### 16.2 Casdoor discovery 还是旧地址

重新设置 Casdoor：

```bash
kubectl -n aisphere set env deployment/casdoor \
  origin='https://casdoor.weagent.cc' \
  originFrontend='https://casdoor.weagent.cc'

kubectl -n aisphere rollout restart deployment/casdoor
```

验证：

```bash
curl -sk https://casdoor.weagent.cc/.well-known/openid-configuration \
  | jq -r '.issuer,.authorization_endpoint,.token_endpoint,.jwks_uri'
```

### 16.3 redirect_uri mismatch

确认 Casdoor 应用 Redirect URL 包含：

```text
https://api.weagent.cc/v1/iam/oauth2/callback
```

并且 SecurityPolicy 中完全一致：

```yaml
redirectURL: "https://api.weagent.cc/v1/iam/oauth2/callback"
```

### 16.4 Envoy 访问 discovery / JWKS 失败

从集群内测试：

```bash
kubectl run casdoor-check \
  -n aisphere \
  --rm -it \
  --image=curlimages/curl \
  --restart=Never \
  -- \
  curl -vk https://casdoor.weagent.cc/.well-known/openid-configuration
```

如果失败，处理 CoreDNS hosts 或内网路由。

### 16.5 证书 Secret 不存在

检查：

```bash
kubectl get certificate -n aisphere
kubectl describe certificate -n aisphere weagent-cc
kubectl get challenge -n aisphere
kubectl describe challenge -n aisphere
kubectl describe clusterissuer letsencrypt-dns01-prod
```

### 16.6 HAProxy 443 不通

检查：

```bash
ss -lntp | grep ':443'
haproxy -c -f /etc/haproxy/haproxy.cfg
systemctl status haproxy --no-pager
kubectl get svc -n envoy-gateway-system | grep aisphere-gateway
```

确认 HAProxy backend 指向的是 Kubernetes NodePort `30723`。

## 17. 最终检查清单

```bash
# cert-manager
kubectl get pods -n cert-manager
kubectl get clusterissuer
kubectl get certificate -n aisphere
kubectl get secret -n aisphere weagent-cc-tls

# Gateway
kubectl get gateway -n aisphere aisphere-gateway -o yaml
kubectl get svc -n envoy-gateway-system | grep aisphere-gateway

# Routes
kubectl get httproute -n aisphere
kubectl get httproute -n aisphere casdoor-public-http -o yaml
kubectl get httproute -n aisphere iam-http -o yaml
kubectl get httproute -n aisphere iam-health-http -o yaml

# SecurityPolicy
kubectl get securitypolicy -n aisphere
kubectl get securitypolicy -n aisphere iam-oidc -o yaml
kubectl describe securitypolicy -n aisphere iam-oidc

# Runtime
curl -vk https://casdoor.weagent.cc/
curl -sk https://casdoor.weagent.cc/.well-known/openid-configuration | jq .
curl -vk https://api.weagent.cc/healthz
curl -vk https://api.weagent.cc/v1/iam
```

成功标准：

```text
1. cert-manager / alidns-webhook Running
2. ClusterIssuer letsencrypt-dns01-prod Ready=True
3. Certificate aisphere/weagent-cc Ready=True
4. Secret aisphere/weagent-cc-tls 存在
5. Gateway HTTPS listener Ready
6. Envoy Service 存在 443:30723
7. HAProxy 443 TCP passthrough 到 30723
8. Casdoor 页面 https://casdoor.weagent.cc 正常
9. Casdoor discovery issuer = https://casdoor.weagent.cc
10. https://api.weagent.cc/healthz 不跳登录
11. https://api.weagent.cc/v1/iam 302 到 Casdoor authorize endpoint
12. 浏览器登录后可以回调 https://api.weagent.cc/v1/iam/oauth2/callback
```
