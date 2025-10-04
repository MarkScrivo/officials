#!/bin/bash

# Google Cloud Run Deployment Script for Officials Test API
# This script deploys the Docker container to Google Cloud Run

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Google Cloud Run Deployment ===${NC}\n"

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}Error: gcloud CLI is not installed${NC}"
    echo "Install it from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Get project ID
echo -e "${YELLOW}Enter your Google Cloud Project ID:${NC}"
read -r PROJECT_ID

if [ -z "$PROJECT_ID" ]; then
    echo -e "${RED}Error: Project ID is required${NC}"
    exit 1
fi

# Set the project
echo -e "\n${GREEN}Setting project to: ${PROJECT_ID}${NC}"
gcloud config set project "$PROJECT_ID"

# Get Gemini API Key
echo -e "\n${YELLOW}Enter your Gemini API Key:${NC}"
read -r GEMINI_API_KEY

if [ -z "$GEMINI_API_KEY" ]; then
    echo -e "${RED}Error: Gemini API Key is required${NC}"
    exit 1
fi

# Configuration
SERVICE_NAME="officialstest-api"
REGION="us-central1"
IMAGE_NAME="us-central1-docker.pkg.dev/${PROJECT_ID}/officialstest/officialstest"

echo -e "\n${GREEN}Configuration:${NC}"
echo "  Service Name: $SERVICE_NAME"
echo "  Region: $REGION"
echo "  Image: $IMAGE_NAME"

# Enable required APIs
echo -e "\n${GREEN}Enabling required Google Cloud APIs...${NC}"
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable artifactregistry.googleapis.com

# Build the Docker image
echo -e "\n${GREEN}Building Docker image...${NC}"
gcloud builds submit --tag "$IMAGE_NAME"

# Deploy to Cloud Run
echo -e "\n${GREEN}Deploying to Cloud Run...${NC}"
gcloud run deploy "$SERVICE_NAME" \
  --image "$IMAGE_NAME" \
  --platform managed \
  --region "$REGION" \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --timeout 300 \
  --set-env-vars "GEMINI_API_KEY=${GEMINI_API_KEY},HEADLESS=true,BROWSER_TIMEOUT=60000,LOG_LEVEL=info" \
  --max-instances 10 \
  --min-instances 0

# Get the service URL
SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" --platform managed --region "$REGION" --format 'value(status.url)')

echo -e "\n${GREEN}=== Deployment Complete! ===${NC}"
echo -e "${GREEN}Service URL: ${SERVICE_URL}${NC}"
echo -e "\n${YELLOW}Test your API:${NC}"
echo "  curl ${SERVICE_URL}/health"
echo "  curl -X POST ${SERVICE_URL}/api/scrape -H 'Content-Type: application/json' -d '{\"school\":\"seminoles.com\",\"gameDate\":\"09/06/25\"}'"
