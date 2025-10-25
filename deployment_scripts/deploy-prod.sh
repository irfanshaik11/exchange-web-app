#!/bin/bash

echo "🚀 Building and deploying Meme Cointrading UI to PRODUCTION..."

# Build and push Docker image
echo "📦 Building Docker image..."
docker build -t kishore2006/meme-cointrading-ui:prod-$(date +%s) .
docker tag kishore2006/meme-cointrading-ui:prod-$(date +%s) kishore2006/meme-cointrading-ui:latest

echo "🐋 Pushing to Docker Hub..."
docker push kishore2006/meme-cointrading-ui:latest

# Deploy to Kubernetes
echo "☸️  Deploying to Kubernetes production namespace..."
kubectl set image deployment/meme-cointrading-ui meme-cointrading-ui=kishore2006/meme-cointrading-ui:latest -n production

echo "✅ Deployment completed!"
echo "🔍 Checking deployment status..."

# Wait for deployment to be ready
kubectl rollout status deployment/meme-cointrading-ui -n production

echo "📋 Deployment Summary:"
kubectl get pods -n production -l app=meme-cointrading-ui
kubectl get services -n production -l app=meme-cointrading-ui

echo ""
echo "🌐 Your frontend is available at: https://app.narrative.trade"
