#!/bin/bash

# Frontend Production Deployment Script
# Meme Coin Trading Platform - Frontend

set -euo pipefail

# Configuration
NAMESPACE="production"
SERVICE_NAME="meme-cointrading-ui"
IMAGE_NAME="kishore2006/meme-cointrading-ui"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"; }
success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }

log "🚀 Deploying Frontend to Production"
echo "Namespace: $NAMESPACE"
echo "Service: $SERVICE_NAME"
echo "Image: $IMAGE_NAME"

# Check if namespace exists
if ! kubectl get namespace $NAMESPACE &> /dev/null; then
    error "Namespace '$NAMESPACE' does not exist. Please create it first."
    exit 1
fi

# Build and push Docker image
log "Building Docker image..."
VERSION=$(date +%Y%m%d-%H%M%S)
docker build --platform linux/amd64 -t $IMAGE_NAME:$VERSION .
docker tag $IMAGE_NAME:$VERSION $IMAGE_NAME:latest
docker push $IMAGE_NAME:$VERSION
docker push $IMAGE_NAME:latest

success "Image built and pushed: $IMAGE_NAME:$VERSION"

# Deploy to Kubernetes
log "Deploying to Kubernetes..."
kubectl apply -f k8s/production/deployment.yaml
kubectl apply -f k8s/production/ingress.yaml

# Wait for deployment to be ready
log "Waiting for deployment to be ready..."
kubectl wait --for=condition=available --timeout=300s deployment/$SERVICE_NAME -n $NAMESPACE

# Check pod status
log "Checking pod status..."
kubectl get pods -n $NAMESPACE -l app=$SERVICE_NAME

# Get ingress status
log "Checking ingress status..."
kubectl get ingress -n $NAMESPACE

success "🎉 Frontend deployment completed successfully!"
log "Frontend should be available at: https://app.narrative.trade"
log "To monitor the deployment: kubectl logs -f deployment/$SERVICE_NAME -n $NAMESPACE"
