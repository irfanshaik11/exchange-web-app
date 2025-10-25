#!/bin/bash

echo "🚀 Building and deploying Meme Cointrading UI..."

# Build and push Docker image
echo "📦 Building Docker image..."
docker build -t kishore2006/meme-cointrading-ui:latest .

echo "🐋 Pushing to Docker Hub..."
docker push kishore2006/meme-cointrading-ui:latest

# Deploy to Kubernetes
echo "☸️  Deploying to Kubernetes..."
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/ingress.yaml

echo "✅ Deployment completed!"
echo "🔍 Checking deployment status..."

# Wait for deployment to be ready
kubectl rollout status deployment/meme-cointrading-ui -n staging

echo "📋 Deployment Summary:"
kubectl get pods -n staging -l app=meme-cointrading-ui
kubectl get services -n staging -l app=meme-cointrading-ui
kubectl get ingress -n staging meme-cointrading-ui-ingress

echo ""
echo "🌐 Your frontend will be available at: https://app.interstate.so"
echo "⚠️  Don't forget to add DNS A record: app.interstate.so -> 34.107.71.218"
