---
title: Roadmap
---

# Aisphere Kernel Roadmap

## Features

- [x] Config — Local Files, K8s ConfigMap, Consul, Etcd, Nacos
- [x] Registry — Consul, Etcd, K8s, Nacos
- [x] Encoding — JSON, Protobuf
- [x] Transport — HTTP, gRPC
- [x] Middleware — Logging, metrics, recovery, gRPC status, tracing, validator, authentication, ratelimit, circuitbreaker
- [x] Metrics — Prometheus, DataDog
- [x] Tracing — HTTP (TLS, Client, Service Registrar), gRPC (TLS, Unary Handler, Streaming Handler)
- [x] Cache — go-redis
- [x] Event — Pub/Sub, Kafka
- [x] Database — Ent, Gorm

## Platform

- [ ] Aisphere Kernel API — Auth, Config, Registry, Events
- [ ] Aisphere Kernel Runtime — Secrets, Service-to-Service, Publish/Subscribe, Observability, Controllable
- [ ] Aisphere Kernel UI — Auth, Config, Services, Endpoints, Ratelimit, CircuitBreaker, FaultInjection, TrafficPolicy

## Tools

- [x] Aisphere Kernel CLI
- [x] HTTP Generator
- [ ] API YAML
- [x] Errors Generator