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
ENV_SOURCE="$PROJECT_DIR/deployment/env/.env.production"
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
# Copy .env from Repo (instead of GCS)
########################################
echo "📥 Copying .env.production from repo..."
if [ -f "$ENV_SOURCE" ]; then
    cp "$ENV_SOURCE" "$ENV_FILE"
    echo "✅ .env copied successfully"
else
    echo "❌ ERROR: .env.production not found at $ENV_SOURCE"
    DEPLOY_STATUS="failure"
fi

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
# Collect Deployment Info
########################################
HOSTNAME=$(hostname)
COMMIT_ID=$(git rev-parse --short HEAD)
COMMIT_AUTHOR=$(git log -1 --format='%an <%ae>')
COMMIT_MESSAGE=$(git log -1 --format='%s')

# Fetch GCP region from metadata service
ZONE=$(curl -s -H "Metadata-Flavor: Google" http://metadata.google.internal/computeMetadata/v1/instance/zone 2>/dev/null | awk -F'/' '{print $NF}')
if [ -n "$ZONE" ]; then
  # Extract region from zone (e.g., us-east1-b -> us-east1)
  REGION=$(echo "$ZONE" | sed 's/-[a-z]$//')
else
  REGION="unknown"
fi

########################################
# Final Status
########################################
echo "🚀 Deployment completed at $(date)"
echo "📄 Logs saved at: $LOG_FILE"
echo "🖥️  Hostname: $HOSTNAME"
echo "🌍 Region: $REGION"
echo "📌 Commit: $COMMIT_ID by $COMMIT_AUTHOR"

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
            { \"title\": \"Instance\", \"value\": \"$HOSTNAME\", \"short\": true },
            { \"title\": \"Region\", \"value\": \"$REGION\", \"short\": true },
            { \"title\": \"Branch\", \"value\": \"$BRANCH\", \"short\": true },
            { \"title\": \"Commit ID\", \"value\": \"$COMMIT_ID\", \"short\": true },
            { \"title\": \"Commit Author\", \"value\": \"$COMMIT_AUTHOR\", \"short\": true },
            { \"title\": \"Commit Message\", \"value\": \"$COMMIT_MESSAGE\", \"short\": false },
            { \"title\": \"Project\", \"value\": \"$APP_NAME\", \"short\": true },
            { \"title\": \"Log File\", \"value\": \"$LOG_FILE\", \"short\": false }
          ]
        }
      ]
    }" "$SLACK_WEBHOOK_URL"
fi

EOF
