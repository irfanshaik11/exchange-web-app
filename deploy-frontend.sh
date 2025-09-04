#!/bin/bash

# Frontend Only Deployment Script
# Meme Coin Trading Platform

set -e

# Configuration
NAMESPACE="staging"
DOCKER_REGISTRY="kishore2006"
SERVICE_NAME="meme-cointrading-ui"
TIMESTAMP=$(date +%Y%m%d%H%M%S)
TAG="v1.0.${TIMESTAMP}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Header
echo -e "${BLUE}"
echo "🎯 Frontend Deployment Script"
echo "=============================="
echo "Service: meme-cointrading-ui"
echo "Namespace: ${NAMESPACE}"
echo "Registry: ${DOCKER_REGISTRY}"
echo "Tag: ${TAG}"
echo -e "${NC}"

# Function to check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if kubectl is installed
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl is not installed or not in PATH"
        exit 1
    fi
    
    # Check if docker is installed
    if ! command -v docker &> /dev/null; then
        log_error "docker is not installed or not in PATH"
        exit 1
    fi
    
    # Check if npm is installed
    if ! command -v npm &> /dev/null; then
        log_error "npm is not installed or not in PATH"
        exit 1
    fi
    
    # Check kubectl cluster connection
    if ! kubectl cluster-info &> /dev/null; then
        log_error "Cannot connect to Kubernetes cluster"
        log_info "Please check your kubectl configuration"
        exit 1
    fi
    
    # Check if we're in the right directory
    if [ ! -f "package.json" ]; then
        log_error "package.json not found. Please run this script from the meme-cointrading-ui directory"
        exit 1
    fi
    
    # Check if Next.js config exists
    if [ ! -f "next.config.js" ]; then
        log_error "next.config.js not found. This doesn't appear to be a Next.js project"
        exit 1
    fi
    
    log_success "All prerequisites check passed"
}

# Function to build Next.js application
build_application() {
    log_info "Building Next.js application..."
    
    # Install dependencies
    log_info "Installing dependencies..."
    npm ci --silent
    
    # Build the application
    log_info "Running Next.js build..."
    npm run build
    
    # Verify build output
    if [ ! -d ".next" ]; then
        log_error "Build failed - .next directory not found"
        exit 1
    fi
    
    if [ ! -d ".next/standalone" ]; then
        log_error "Build failed - standalone output not found"
        log_info "Make sure next.config.js has output: 'standalone' configured"
        exit 1
    fi
    
    log_success "Application build completed"
}

# Function to build and push Docker image
build_docker_image() {
    log_info "Building Docker image: ${DOCKER_REGISTRY}/${SERVICE_NAME}:${TAG}"
    
    # Build and push the image
    docker buildx build \
        --no-cache \
        --platform linux/amd64 \
        -t ${DOCKER_REGISTRY}/${SERVICE_NAME}:${TAG} \
        -t ${DOCKER_REGISTRY}/${SERVICE_NAME}:latest \
        --push \
        .
    
    if [ $? -eq 0 ]; then
        log_success "Docker image built and pushed successfully"
        log_info "Image: ${DOCKER_REGISTRY}/${SERVICE_NAME}:${TAG}"
    else
        log_error "Docker build failed"
        exit 1
    fi
}

# Function to deploy to Kubernetes
deploy_to_kubernetes() {
    log_info "Deploying to Kubernetes..."
    
    # Update the deployment with new image
    kubectl set image deployment/${SERVICE_NAME} ${SERVICE_NAME}=${DOCKER_REGISTRY}/${SERVICE_NAME}:${TAG} -n ${NAMESPACE}
    
    if [ $? -eq 0 ]; then
        log_success "Deployment updated with new image"
    else
        log_error "Failed to update deployment"
        exit 1
    fi
    
    # Wait for rollout to complete
    log_info "Waiting for deployment rollout to complete..."
    kubectl rollout status deployment/${SERVICE_NAME} -n ${NAMESPACE} --timeout=300s
    
    if [ $? -eq 0 ]; then
        log_success "Deployment rollout completed successfully"
    else
        log_error "Deployment rollout failed or timed out"
        log_info "Check pod status with: kubectl get pods -n ${NAMESPACE}"
        exit 1
    fi
}

# Function to perform health checks
health_check() {
    log_info "Performing health checks..."
    
    # Wait a bit for pods to be ready
    sleep 30
    
    # Check pod status
    log_info "Checking pod status..."
    kubectl get pods -n ${NAMESPACE} | grep ${SERVICE_NAME}
    
    # Test the endpoint
    log_info "Testing frontend endpoint..."
    
    # Try multiple times in case of temporary issues
    for i in {1..3}; do
        response=$(curl -s -o /dev/null -w "%{http_code}" https://staging-app.narrative.trade)
        if [ "$response" = "200" ]; then
            log_success "Frontend health check passed (HTTP $response)"
            return 0
        else
            log_warning "Health check attempt $i failed (HTTP $response)"
            if [ $i -lt 3 ]; then
                log_info "Retrying in 10 seconds..."
                sleep 10
            fi
        fi
    done
    
    log_warning "Health check failed after 3 attempts"
    log_info "The deployment may still be starting up. Check manually:"
    log_info "  kubectl logs deployment/${SERVICE_NAME} -n ${NAMESPACE}"
    log_info "  curl -I https://staging-app.narrative.trade"
}

# Function to show deployment status
show_status() {
    log_info "Current deployment status:"
    echo ""
    echo "🎯 Frontend Service:"
    echo "   URL: https://staging-app.narrative.trade"
    echo "   Image: ${DOCKER_REGISTRY}/${SERVICE_NAME}:${TAG}"
    echo "   Namespace: ${NAMESPACE}"
    echo ""
    echo "📊 Kubernetes Resources:"
    kubectl get deployment,pods,service,ingress -n ${NAMESPACE} | grep -E "(NAME|${SERVICE_NAME})"
    echo ""
    echo "🔍 Recent Events:"
    kubectl get events -n ${NAMESPACE} --sort-by='.lastTimestamp' | tail -5
}

# Function to rollback deployment
rollback_deployment() {
    log_warning "Rolling back deployment..."
    kubectl rollout undo deployment/${SERVICE_NAME} -n ${NAMESPACE}
    kubectl rollout status deployment/${SERVICE_NAME} -n ${NAMESPACE} --timeout=300s
    log_success "Rollback completed"
}

# Function to show logs
show_logs() {
    log_info "Recent application logs:"
    kubectl logs deployment/${SERVICE_NAME} -n ${NAMESPACE} --tail=20
}

# Main deployment function
deploy_frontend() {
    local start_time=$(date +%s)
    
    check_prerequisites
    build_application
    build_docker_image
    deploy_to_kubernetes
    health_check
    show_status
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    log_success "Frontend deployment completed successfully! 🎉"
    log_info "Total deployment time: ${duration} seconds"
    log_info "Frontend is available at: https://staging-app.narrative.trade"
}

# Command line argument handling
case "${1:-deploy}" in
    "deploy")
        deploy_frontend
        ;;
    "status")
        show_status
        ;;
    "logs")
        show_logs
        ;;
    "rollback")
        rollback_deployment
        ;;
    "health")
        health_check
        ;;
    "help"|"-h"|"--help")
        echo "Frontend Deployment Script"
        echo ""
        echo "Usage: $0 [command]"
        echo ""
        echo "Commands:"
        echo "  deploy     Deploy the frontend (default)"
        echo "  status     Show current deployment status"
        echo "  logs       Show recent application logs"
        echo "  rollback   Rollback to previous version"
        echo "  health     Run health checks"
        echo "  help       Show this help message"
        echo ""
        echo "Examples:"
        echo "  $0                 # Deploy frontend"
        echo "  $0 deploy          # Deploy frontend"
        echo "  $0 status          # Show status"
        echo "  $0 rollback        # Rollback deployment"
        ;;
    *)
        log_error "Unknown command: $1"
        log_info "Use '$0 help' to see available commands"
        exit 1
        ;;
esac
