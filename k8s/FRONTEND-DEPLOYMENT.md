# Frontend Deployment Guide
# Meme Coin Trading Platform - Frontend Only

## Overview
This document covers the deployment of only the frontend service (Next.js application) for the Meme Coin Trading Platform.

## Prerequisites

### Required Tools
- Docker with buildx support
- kubectl configured for your Kubernetes cluster
- Access to push to `kishore2006/meme-cointrading-ui` Docker repository

### Required Services (External Dependencies)
The frontend requires these services to be already running:
- Backend API at: `https://staging-backend.interstate.so`
- Token WebSocket Service at: `https://token-staging.interstate.so`

## Frontend Service Details

### Technology Stack
- **Framework**: Next.js 15.5.2
- **Runtime**: Node.js 20 Alpine
- **Port**: 3000
- **Build**: Static generation with standalone output

### Environment Variables
```env
NODE_ENV=production
NEXT_PUBLIC_BACKEND_URL=https://staging-backend.interstate.so
NEXT_PUBLIC_WEBSOCKET_URL=https://token-staging.interstate.so
NEXT_PUBLIC_IS_BACKEND_DEPLOYED=true
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=f8b3c9d2e1a4b5c6d7e8f9a0b1c2d3e4
DATABASE_URL=postgresql://postgres:password@postgres:5432/tokenservice
```

## Deployment Steps

### 1. Build the Application

```bash
cd meme-cointrading-ui

# Install dependencies
npm install

# Build the Next.js application
npm run build
```

### 2. Build Docker Image

```bash
# Build and push the Docker image
docker buildx build --no-cache --platform linux/amd64 -t kishore2006/meme-cointrading-ui:v1.0.4 --push .
```

### 3. Apply Kubernetes Configuration

```bash
# Apply the deployment
kubectl apply -f k8s/deployment.yaml

# Apply the ingress
kubectl apply -f k8s/ingress.yaml
```

### 4. Update Deployment Image

```bash
# Update the deployment with new image
kubectl set image deployment/meme-cointrading-ui meme-cointrading-ui=kishore2006/meme-cointrading-ui:v1.0.4 -n staging
```

### 5. Verify Deployment

```bash
# Check deployment status
kubectl get pods -n staging | grep meme-cointrading-ui

# Check rollout status
kubectl rollout status deployment/meme-cointrading-ui -n staging

# Check logs
kubectl logs deployment/meme-cointrading-ui -n staging --tail=50
```

## Kubernetes Configurations

### Deployment Configuration (`k8s/deployment.yaml`)
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: meme-cointrading-ui
  namespace: staging
spec:
  replicas: 2
  selector:
    matchLabels:
      app: meme-cointrading-ui
  template:
    metadata:
      labels:
        app: meme-cointrading-ui
    spec:
      containers:
        - name: meme-cointrading-ui
          image: kishore2006/meme-cointrading-ui:latest
          ports:
            - containerPort: 3000
          env:
            - name: NODE_ENV
              value: "production"
            - name: NEXT_PUBLIC_BACKEND_URL
              value: "https://staging-backend.interstate.so"
            - name: NEXT_PUBLIC_WEBSOCKET_URL
              value: "https://token-staging.interstate.so"
            - name: NEXT_PUBLIC_IS_BACKEND_DEPLOYED
              value: "true"
            - name: NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
              value: "f8b3c9d2e1a4b5c6d7e8f9a0b1c2d3e4"
            - name: DATABASE_URL
              value: "postgresql://postgres:password@postgres:5432/tokenservice"
          livenessProbe:
            httpGet:
              path: /
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 5
          resources:
            requests:
              memory: "256Mi"
              cpu: "250m"
            limits:
              memory: "512Mi"
              cpu: "500m"
---
apiVersion: v1
kind: Service
metadata:
  name: meme-cointrading-ui
  namespace: staging
spec:
  selector:
    app: meme-cointrading-ui
  ports:
    - protocol: TCP
      port: 3000
      targetPort: 3000
  type: ClusterIP
```

### Ingress Configuration (`k8s/ingress.yaml`)
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: meme-cointrading-ui-ingress
  namespace: staging
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/force-ssl-redirect: "true"
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - staging-app.narrative.trade
    secretName: meme-cointrading-ui-tls
  rules:
  - host: staging-app.narrative.trade
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: meme-cointrading-ui
            port:
              number: 3000
```

### Dockerfile
```dockerfile
FROM node:20-alpine

# Create app directory
WORKDIR /app

# Add a non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built application
COPY .next/standalone ./
COPY .next/static ./.next/static
COPY public ./public

# Change ownership to nextjs user
RUN chown nextjs:nodejs .next

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

# Set environment
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Start the application
CMD ["node", "server.js"]
```

## Automated Deployment Script

Create `deploy-frontend.sh`:

```bash
#!/bin/bash

set -e

# Configuration
NAMESPACE="staging"
DOCKER_REGISTRY="kishore2006"
SERVICE_NAME="meme-cointrading-ui"
TIMESTAMP=$(date +%Y%m%d%H%M%S)
TAG="v1.0.${TIMESTAMP}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

echo -e "${BLUE}🚀 Frontend Deployment Script${NC}"
echo "=================================="

# Check prerequisites
log_info "Checking prerequisites..."
if ! command -v kubectl &> /dev/null; then
    log_error "kubectl is not installed"
    exit 1
fi

if ! command -v docker &> /dev/null; then
    log_error "docker is not installed"
    exit 1
fi

if ! kubectl cluster-info &> /dev/null; then
    log_error "Cannot connect to Kubernetes cluster"
    exit 1
fi

log_success "Prerequisites check passed"

# Build application
log_info "Building Next.js application..."
npm run build

# Build and push Docker image
log_info "Building Docker image: ${TAG}..."
docker buildx build --no-cache --platform linux/amd64 -t ${DOCKER_REGISTRY}/${SERVICE_NAME}:${TAG} --push .

log_success "Docker image built and pushed: ${TAG}"

# Deploy to Kubernetes
log_info "Deploying to Kubernetes..."
kubectl set image deployment/${SERVICE_NAME} ${SERVICE_NAME}=${DOCKER_REGISTRY}/${SERVICE_NAME}:${TAG} -n ${NAMESPACE}

# Wait for rollout
log_info "Waiting for deployment to complete..."
kubectl rollout status deployment/${SERVICE_NAME} -n ${NAMESPACE} --timeout=300s

# Health check
log_info "Performing health check..."
sleep 30

if curl -s -o /dev/null -w "%{http_code}" https://staging-app.narrative.trade | grep -q "200"; then
    log_success "Health check passed - Frontend is responding"
else
    log_warning "Health check failed - Frontend may not be ready yet"
fi

# Show status
log_info "Deployment status:"
kubectl get pods -n ${NAMESPACE} | grep ${SERVICE_NAME}

log_success "Frontend deployment completed! 🎉"
log_info "Frontend URL: https://staging-app.narrative.trade"
```

Make it executable:
```bash
chmod +x deploy-frontend.sh
```

## Quick Commands

### Deploy Frontend Only
```bash
# Using the script
./deploy-frontend.sh

# Manual deployment
npm run build
docker buildx build --no-cache --platform linux/amd64 -t kishore2006/meme-cointrading-ui:latest --push .
kubectl set image deployment/meme-cointrading-ui meme-cointrading-ui=kishore2006/meme-cointrading-ui:latest -n staging
```

### Monitor Deployment
```bash
# Watch pod status
kubectl get pods -n staging -w | grep meme-cointrading-ui

# Check logs
kubectl logs deployment/meme-cointrading-ui -n staging -f

# Check deployment events
kubectl describe deployment meme-cointrading-ui -n staging
```

### Scale Frontend
```bash
# Scale up
kubectl scale deployment meme-cointrading-ui --replicas=3 -n staging

# Scale down
kubectl scale deployment meme-cointrading-ui --replicas=1 -n staging
```

### Rollback Frontend
```bash
# Rollback to previous version
kubectl rollout undo deployment/meme-cointrading-ui -n staging

# Check rollout history
kubectl rollout history deployment/meme-cointrading-ui -n staging
```

## Troubleshooting

### Common Issues

#### Pod Not Starting
```bash
# Check pod details
kubectl describe pod <pod-name> -n staging

# Check logs
kubectl logs <pod-name> -n staging
```

#### Image Pull Errors
```bash
# Verify image exists
docker pull kishore2006/meme-cointrading-ui:latest

# Check if image was pushed correctly
docker images | grep meme-cointrading-ui
```

#### Health Check Failures
```bash
# Check if port 3000 is responding
kubectl port-forward deployment/meme-cointrading-ui 3000:3000 -n staging

# Test locally
curl http://localhost:3000
```

#### SSL Certificate Issues
```bash
# Check certificate status
kubectl get certificates -n staging
kubectl describe certificate meme-cointrading-ui-tls -n staging

# Force certificate renewal
kubectl delete certificate meme-cointrading-ui-tls -n staging
kubectl apply -f k8s/ingress.yaml
```

## Environment-Specific Configurations

### Development
```yaml
env:
  - name: NODE_ENV
    value: "development"
  - name: NEXT_PUBLIC_BACKEND_URL
    value: "http://localhost:8000"
  - name: NEXT_PUBLIC_WEBSOCKET_URL
    value: "ws://localhost:9000"
```

### Staging
```yaml
env:
  - name: NODE_ENV
    value: "production"
  - name: NEXT_PUBLIC_BACKEND_URL
    value: "https://staging-backend.interstate.so"
  - name: NEXT_PUBLIC_WEBSOCKET_URL
    value: "https://token-staging.interstate.so"
```

### Production
```yaml
env:
  - name: NODE_ENV
    value: "production"
  - name: NEXT_PUBLIC_BACKEND_URL
    value: "https://api.narrative.trade"
  - name: NEXT_PUBLIC_WEBSOCKET_URL
    value: "https://ws.narrative.trade"
```

## Performance Optimization

### Resource Limits
```yaml
resources:
  requests:
    memory: "256Mi"
    cpu: "250m"
  limits:
    memory: "512Mi"
    cpu: "500m"
```

### Horizontal Pod Autoscaler
```bash
kubectl autoscale deployment meme-cointrading-ui --cpu-percent=70 --min=2 --max=10 -n staging
```

### CDN Integration
For production, consider adding CDN configuration:
```yaml
annotations:
  nginx.ingress.kubernetes.io/configuration-snippet: |
    add_header Cache-Control "public, max-age=31536000, immutable" always;
```

## Security Considerations

### Network Policies
```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: frontend-network-policy
  namespace: staging
spec:
  podSelector:
    matchLabels:
      app: meme-cointrading-ui
  policyTypes:
  - Egress
  egress:
  - to: []
    ports:
    - protocol: TCP
      port: 8000  # Backend
    - protocol: TCP
      port: 9000  # WebSocket
    - protocol: TCP
      port: 443   # HTTPS
```

### Security Headers
```yaml
annotations:
  nginx.ingress.kubernetes.io/configuration-snippet: |
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
```

## Monitoring

### Health Checks
```yaml
livenessProbe:
  httpGet:
    path: /
    port: 3000
  initialDelaySeconds: 30
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 5
  timeoutSeconds: 3
  failureThreshold: 3
```

### Metrics Collection
```yaml
annotations:
  prometheus.io/scrape: "true"
  prometheus.io/port: "3000"
  prometheus.io/path: "/metrics"
```

## Current Status

### Live Service
- **URL**: https://staging-app.narrative.trade
- **Status**: ✅ Active
- **SSL**: ✅ Valid Let's Encrypt Certificate
- **Replicas**: 2 pods running
- **Image**: `kishore2006/meme-cointrading-ui:v1.0.3`

### Dependencies
- **Backend API**: https://staging-backend.interstate.so ✅
- **WebSocket Service**: https://token-staging.interstate.so ✅

---

Last Updated: September 4, 2025
Version: v1.0.3
