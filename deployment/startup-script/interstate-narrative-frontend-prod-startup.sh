#!/bin/bash
# ==========================================
# GCP VM Startup Script — Frontend (Next.js)
# ==========================================

RUN_USER="ubuntu"
RUN_GROUP="ubuntu"
LOG_DIR="/home/$RUN_USER/logs"
mkdir -p "$LOG_DIR"
chown "$RUN_USER:$RUN_GROUP" "$LOG_DIR"

sudo -u "$RUN_USER" bash <<'EOF'
set -euo pipefail

########################################
# Configuration
########################################
PROJECT_DIR="/home/ubuntu/exchange-web-app"
BRANCH="prod"
APP_NAME="nextjs-app"
ENV_FILE="$PROJECT_DIR/.env"
LOG_DIR="/home/ubuntu/logs"
TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
LOG_FILE="$LOG_DIR/frontend-deploy-$TIMESTAMP.log"
SLACK_WEBHOOK_URL="https://hooks.slack.com/services/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"

########################################
# Logging Setup
########################################
mkdir -p "$LOG_DIR"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "🚀 Starting frontend deployment at $(date)..."
DEPLOY_STATUS="success"

########################################
# Validate project directory
########################################
if [ ! -d "$PROJECT_DIR" ]; then
  echo "❌ Project directory does not exist: $PROJECT_DIR"
  DEPLOY_STATUS="failure"
  exit 1
fi
cd "$PROJECT_DIR" || { DEPLOY_STATUS="failure"; exit 1; }

########################################
# Stop existing PM2 process
########################################
echo "⏹ Stopping existing PM2 process..."
pm2 stop "$APP_NAME" 2>/dev/null || true
pm2 delete "$APP_NAME" 2>/dev/null || true

########################################
# Pull latest code
########################################
echo "🔄 Pulling latest code from $BRANCH..."
git fetch origin || DEPLOY_STATUS="failure"
git reset --hard origin/"$BRANCH" || DEPLOY_STATUS="failure"

########################################
# Fetch .env from GCS bucket
########################################
echo "📥 Fetching .env file from GCS bucket..."
gsutil cp gs://github-deployment/prod-global/env-file/frontend/.env "$PROJECT_DIR/.env" || {
  echo "⚠️ Failed to copy .env file from GCS bucket"
  DEPLOY_STATUS="failure"
}

########################################
# Install dependencies
########################################
# echo "📦 Installing dependencies..."
# npm ci || DEPLOY_STATUS="failure"

########################################
# Lint & Type Check (non-blocking)
########################################
echo "🧹 Running lint and type checks..."
npm install
npm install @eslint/eslintrc typescript-eslint --save-dev || echo "ESLint deps already installed"
#npx eslint . --ext .js,.jsx,.ts,.tsx || echo "⚠️ Lint warnings (non-blocking)"
#npm run typecheck || echo "⚠️ Type checking warnings (non-blocking)"

########################################
# Build Next.js App
########################################
echo "🔨 Building frontend..."
npm run build || DEPLOY_STATUS="failure"

# Verify build directory
if [ -d ".next" ]; then
  echo "✅ Build successful - .next directory found"
else
  echo "❌ Build failed - .next directory missing"
  DEPLOY_STATUS="failure"
fi

########################################
# Start with PM2
########################################
echo "▶️ Starting frontend with PM2..."
pm2 start npm --name "$APP_NAME" --cwd "$PROJECT_DIR" -- start --env-file="$ENV_FILE" || DEPLOY_STATUS="failure"
pm2 save || true
pm2 status || true

########################################
# Final Status
########################################
echo "🚀 Deployment completed at $(date)"
echo "📄 Logs saved at: $LOG_FILE"

if [ "$DEPLOY_STATUS" = "success" ]; then
  echo "✅ Frontend deployment successful!"
else
  echo "❌ Frontend deployment failed!"
fi

########################################
# Slack Notification
########################################
if [ -n "$SLACK_WEBHOOK_URL" ]; then
  STATUS_TEXT="❌ Frontend Deployment Failed"
  COLOR="danger"
  if [ "$DEPLOY_STATUS" = "success" ]; then
    STATUS_TEXT="✅ Frontend Deployment Successful"
    COLOR="good"
  fi

  curl -X POST -H 'Content-type: application/json' \
    --data "{
      \"text\": \"$STATUS_TEXT\",
      \"attachments\": [
        {
          \"color\": \"$COLOR\",
          \"fields\": [
            { \"title\": \"Project\", \"value\": \"$APP_NAME\", \"short\": true },
            { \"title\": \"Branch\", \"value\": \"$BRANCH\", \"short\": true },
            { \"title\": \"Log File\", \"value\": \"$LOG_FILE\", \"short\": false }
          ]
        }
      ]
    }" "$SLACK_WEBHOOK_URL"
fi

EOF
