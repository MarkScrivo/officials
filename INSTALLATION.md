# Officials Scraper API - Installation Guide

## Overview
This application scrapes NCAA officials data from multiple schools and provides both CLI and REST API access. It uses Playwright for web scraping and AI (Anthropic Claude) for PDF processing.

## System Requirements
- **Node.js**: 18.x or higher
- **npm**: 9.x or higher
- **Memory**: 2GB+ RAM recommended
- **Platform**: Linux, macOS, or Windows with WSL

## Installation Steps

### 1. Extract Files
```bash
unzip officials-scraper.zip
cd officialstest_current
```

### 2. Install Dependencies
```bash
npm install
```

This will install all required packages including:
- Express (API server)
- Playwright (web scraping)
- Anthropic SDK (AI processing)
- TypeScript & build tools

### 3. Install Playwright Browsers
```bash
npx playwright install chromium
```

This downloads the Chromium browser needed for web scraping.

### 4. Configure Environment Variables

Create a `.env` file in the root directory:

```bash
# Required - Anthropic API key for PDF processing
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Optional - for testing other AI providers
OPENAI_API_KEY=your_openai_key_here
GOOGLE_API_KEY=your_google_key_here

# API Configuration (defaults shown)
PORT=3000
NODE_ENV=production
MAX_CONCURRENT_SCHOOLS=5

# Scraping Configuration
RETRY_ATTEMPTS=3
REQUEST_TIMEOUT=30000
```

**Important**: You must obtain an Anthropic API key from https://console.anthropic.com/

### 5. Build the Application
```bash
npm run build
```

This compiles TypeScript to JavaScript in the `dist/` folder.

## Running the Application

### Production Mode (API Server)
```bash
npm start
```

This starts the API server on port 3000 (or your configured PORT).

The API will be available at: `http://localhost:3000`

### CLI Mode (Direct Scraping)
```bash
npm run scrape
```

This runs a one-time scrape and outputs to `output/` directory.

### Development Mode
```bash
npm run dev          # CLI with auto-reload
npm run api-dev      # API server with auto-reload
```

## API Endpoints

### GET /health
Health check endpoint
```bash
curl http://localhost:3000/health
```

### POST /api/scrape
Scrape officials for specific schools

**Request Body:**
```json
{
  "schools": [
    "georgia",
    "florida",
    "clemson"
  ]
}
```

**Example:**
```bash
curl -X POST http://localhost:3000/api/scrape \
  -H "Content-Type: application/json" \
  -d '{"schools": ["georgia", "florida"]}'
```

### GET /api/scrape/all
Scrape all configured schools
```bash
curl http://localhost:3000/api/scrape/all
```

## Supported Schools
- georgia
- florida
- kentucky
- missouri
- lsu
- auburn
- alabama
- southcarolina
- tennessee
- olemiss
- texasam
- mississippistate
- arkansas
- vanderbilt
- texas
- oklahoma
- clemson
- floridastate
- ncstate
- louisville
- northcarolina
- duke
- miami
- virginia
- virginiatech
- pittsburgh
- california
- stanfordsports
- georgiatech
- bostoncollege
- syracuse
- smu
- wakeforest

(More schools can be added in `src/config/school-config.ts`)

## Docker Deployment (Optional)

If you prefer Docker:

```bash
docker-compose build
docker-compose up -d
```

The API will be available at `http://localhost:3000`

## Monitoring & Logs

The application outputs detailed logs to console:
- Scraping progress
- AI token usage
- Error messages
- Performance metrics

For production, consider redirecting logs:
```bash
npm start > app.log 2>&1 &
```

## Troubleshooting

### Port Already in Use
```bash
# Change PORT in .env file or:
PORT=8080 npm start
```

### Playwright Browser Issues
```bash
# Reinstall browsers
npx playwright install --force chromium
```

### Memory Issues
```bash
# Increase Node.js memory limit
NODE_OPTIONS="--max-old-space-size=4096" npm start
```

### API Key Errors
Ensure your `.env` file has a valid `ANTHROPIC_API_KEY`

## Production Deployment

### Process Manager (Recommended)
Use PM2 to keep the app running:

```bash
npm install -g pm2
pm2 start dist/api/index.js --name officials-api
pm2 startup
pm2 save
```

### Nginx Reverse Proxy (Recommended)
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Systemd Service (Linux)
Create `/etc/systemd/system/officials-api.service`:

```ini
[Unit]
Description=Officials Scraper API
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/path/to/officialstest_current
Environment=NODE_ENV=production
ExecStart=/usr/bin/node dist/api/index.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable officials-api
sudo systemctl start officials-api
```

## Security Considerations

1. **API Keys**: Never commit `.env` to version control
2. **Rate Limiting**: Consider adding rate limiting middleware
3. **CORS**: Configure CORS origins in production
4. **HTTPS**: Use HTTPS in production (via nginx/cloudflare)
5. **Firewall**: Restrict access to port 3000 if using reverse proxy

## Performance Tuning

- **Concurrent Schools**: Adjust `MAX_CONCURRENT_SCHOOLS` in `.env` (default: 5)
- **Retry Logic**: Adjust `RETRY_ATTEMPTS` for network reliability
- **Timeouts**: Modify `REQUEST_TIMEOUT` based on network speed

## Support & Maintenance

### Update Dependencies
```bash
npm update
npm audit fix
```

### Check Logs
```bash
# If using PM2
pm2 logs officials-api

# If using systemd
sudo journalctl -u officials-api -f
```

## File Structure
```
officialstest_current/
├── src/              # Source TypeScript files
├── dist/             # Compiled JavaScript (after build)
├── output/           # Scraping output files
├── package.json      # Dependencies
├── tsconfig.json     # TypeScript config
├── .env              # Environment variables (create this)
└── README.md         # Project documentation
```

## Questions?
Refer to `README.md` and `HOW_IT_WORKS.md` for more details.
