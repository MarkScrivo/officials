# Deploying to Render.com

This guide will help you deploy your Officials Test API to Render.com, which has excellent support for Playwright and Docker.

## Prerequisites

1. A Render account (sign up at https://render.com)
2. Your GitHub/GitLab repository URL (or you can deploy directly)
3. Your Gemini API key

## Deployment Options

### Option 1: Deploy from GitHub (Recommended)

1. **Push your code to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin YOUR_GITHUB_REPO_URL
   git push -u origin main
   ```

2. **Create a new Web Service on Render**
   - Go to https://dashboard.render.com
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Render will automatically detect the `render.yaml` file

3. **Set Environment Variables**
   - In the Render dashboard, go to your service
   - Navigate to "Environment" tab
   - Add your `GEMINI_API_KEY` value
   - All other variables are pre-configured in `render.yaml`

4. **Deploy**
   - Click "Create Web Service"
   - Render will build and deploy your Docker container
   - Wait 5-10 minutes for the first deployment

### Option 2: Deploy using Render CLI

1. **Install Render CLI**
   ```bash
   npm install -g render-cli
   ```

2. **Login to Render**
   ```bash
   render login
   ```

3. **Deploy**
   ```bash
   render deploy
   ```

### Option 3: Manual Docker Deploy

1. **Create New Web Service**
   - Go to https://dashboard.render.com
   - Click "New +" → "Web Service"
   - Choose "Deploy an existing image from a registry"

2. **Build and Push to Docker Hub** (if you want to use your own registry)
   ```bash
   docker build -t YOUR_USERNAME/officialstest:latest .
   docker push YOUR_USERNAME/officialstest:latest
   ```

3. **Configure Service**
   - Image URL: `YOUR_USERNAME/officialstest:latest`
   - Region: Oregon (or closest to you)
   - Instance Type: Starter ($7/month) or higher
   - Add environment variables (GEMINI_API_KEY, etc.)

## Configuration Details

### Service Configuration (render.yaml)

The `render.yaml` file is pre-configured with:
- **Type**: Web Service (Docker)
- **Region**: Oregon (you can change this)
- **Plan**: Starter ($7/month)
- **Health Check**: `/health` endpoint
- **Port**: 8080 (internal)

### Environment Variables

Required:
- `GEMINI_API_KEY` - Your Google Gemini API key (set in Render dashboard)

Pre-configured:
- `HEADLESS=true` - Run browser in headless mode
- `BROWSER_TIMEOUT=90000` - 90 second timeout
- `LOG_LEVEL=info` - Logging level
- `PORT=8080` - Server port

### Resource Requirements

**Minimum Recommended:**
- Plan: Starter ($7/month)
- RAM: 512 MB
- CPU: 0.5 CPU

**For Better Performance:**
- Plan: Standard ($25/month)
- RAM: 2 GB
- CPU: 1 CPU

## Post-Deployment

### Testing Your API

Once deployed, your service will be available at:
```
https://officialstest-api.onrender.com
```

Test the health endpoint:
```bash
curl https://YOUR_SERVICE_URL.onrender.com/health
```

Test the scrape endpoint:
```bash
curl -X POST https://YOUR_SERVICE_URL.onrender.com/api/scrape \
  -H 'Content-Type: application/json' \
  -d '{"school":"seminoles.com","gameDate":"09/06/25"}'
```

### Viewing Logs

- Go to your service in Render dashboard
- Click "Logs" tab
- View real-time logs

### Updating Your Service

**If deployed from GitHub:**
- Push changes to your repository
- Render will automatically rebuild and deploy

**Manual update:**
```bash
git push origin main
# Render auto-deploys on push
```

## Troubleshooting

### Service won't start
- Check environment variables are set correctly
- View logs in Render dashboard
- Ensure `GEMINI_API_KEY` is set

### Playwright errors
- Render supports Playwright out of the box
- If issues persist, increase instance size to Standard plan

### Timeout errors
- Increase `BROWSER_TIMEOUT` environment variable
- Consider upgrading to a larger instance

## Pricing

Render pricing (as of 2024):
- **Free**: Not recommended for Playwright (limited resources)
- **Starter**: $7/month - Good for testing
- **Standard**: $25/month - Recommended for production

## Support

- Render Docs: https://render.com/docs
- Render Community: https://community.render.com
- Status: https://status.render.com

## Comparison: Render vs Google Cloud Run

**Render Advantages:**
- Native Docker support
- Better Playwright/Chromium compatibility
- Simpler deployment
- Auto-deploy from GitHub
- Better for long-running browser processes

**Cloud Run Advantages:**
- More scaling options
- Pay-per-use pricing
- Google Cloud integration

For your Playwright scraping use case, **Render is the better choice**.
