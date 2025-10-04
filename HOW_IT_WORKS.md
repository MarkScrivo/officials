# How the Officials Scraper Works

## High-Level Architecture Overview

This application is a specialized web scraping system that extracts football game officials data from college sports websites using AI-powered content analysis. The system consists of several key components working together:

```
┌─────────────────────────────────────────────────────────────┐
│                      RESTful API (Express)                   │
│                    localhost:3000 / :8080                    │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│                  Officials Scraper Orchestrator              │
│              (Coordinates the scraping process)              │
└────────┬─────────────────────────────────┬──────────────────┘
         │                                 │
         ▼                                 ▼
┌──────────────────────┐         ┌──────────────────────────┐
│  Playwright Fetcher  │         │   AI Extractor Layer     │
│  (Browser Automation)│         │  (Gemini/OpenAI/Claude)  │
│                      │         │                          │
│ - Headless Chrome    │         │ - Structured Extraction  │
│ - JavaScript Render  │         │ - Schema Validation      │
│ - Screenshot Capture │         │ - Name Formatting        │
│ - Retry Logic        │         │ - Multi-Provider Support │
└──────────────────────┘         └──────────────────────────┘
         │                                 │
         ▼                                 ▼
┌─────────────────────────────────────────────────────────────┐
│                      School Configuration                    │
│            (schools.json - Multi-school support)             │
└─────────────────────────────────────────────────────────────┘
```

### Key Components

1. **RESTful API Server** - Express.js server providing:
   - `/scrape` - Async endpoint (returns immediately with requestId)
   - `/scrape-sync` - Sync endpoint (waits for result)
   - `/health` - Health check
   - `/status/:requestId` - Check async job status

2. **Officials Scraper** - Main orchestrator coordinating the scraping workflow

3. **Playwright Fetcher** - Browser automation for rendering JavaScript-heavy pages

4. **AI Extractor** - Intelligent content extraction using LLMs (Gemini/OpenAI/Anthropic)

5. **School Config Manager** - Centralized configuration for multiple schools

6. **PDF Processor** - Fallback for extracting officials from PDF boxscores

---

## Detailed Scraping Process

### Two-Phase Scraping Workflow

The scraper uses a sophisticated two-phase approach to reliably extract officials data:

#### **Phase 1: Schedule Page Analysis**

```
1. Build schedule URL based on school domain
   └─→ Example: https://seminoles.com/sports/football/schedule

2. Launch Playwright browser (headless Chrome)
   └─→ Render JavaScript-heavy schedule page
   └─→ Wait for dynamic content to load (5-8 seconds)
   └─→ Capture full HTML content + screenshot

3. Send content to AI model with structured prompt:
   └─→ "Find the game on date MM/DD/YY"
   └─→ "Extract: date, homeTeam, awayTeam, opponent, location"
   └─→ "Find the boxscore URL or PDF link"

4. AI returns structured JSON with:
   └─→ Game metadata (teams, date, location)
   └─→ Boxscore URL (HTML page with officials)
   └─→ PDF URL (optional - direct PDF boxscore)
```

#### **Phase 2: Boxscore/PDF Extraction**

```
IF PDF URL found:
├─→ Download PDF boxscore
├─→ Extract text using pdf-parse
├─→ Send PDF text to AI with prompt:
│   └─→ "Extract officials data from this boxscore"
│   └─→ "Format names as LastName,FirstName"
└─→ Return structured officials data

ELSE IF Boxscore URL found:
├─→ Navigate to boxscore page with Playwright
├─→ Wait for officials content to load
├─→ Capture HTML + screenshot
├─→ Send to AI model with prompt:
│   └─→ "Extract game officials from this boxscore"
│   └─→ "Find: Referee, Umpire, Line Judge, etc."
│   └─→ "Format names as LastName,FirstName"
└─→ Return structured officials data

ELSE:
└─→ Return error: "No boxscore found"
```

### Intelligent Retry Logic

The system implements exponential backoff retry for resilience:

```
Attempt 1: Immediate
  ├─ Fail → Wait 2 seconds
Attempt 2: After 2s delay
  ├─ Fail → Wait 4 seconds
Attempt 3: After 4s delay
  └─ Fail → Return error with full context
```

### Name Formatting

Officials names are automatically normalized to `LastName,FirstName` format:

```javascript
Input formats handled:
- "John Smith"      → "Smith,John"
- "Smith,John"      → "Smith,John" (already correct)
- "Smith, John"     → "Smith,John" (trim spaces)
- "John Q. Smith"   → Handled intelligently by AI
```

### Schema Validation

The AI models are configured with strict output schemas to guarantee consistent JSON structure:

```typescript
{
  gameFound: boolean,
  game: {
    date: string,
    homeTeam: string,
    awayTeam: string,
    opponent: string,
    location?: string,
    time?: string
  },
  officials: {
    referee?: string,
    umpire?: string,
    lineJudge?: string,
    sideJudge?: string,
    backJudge?: string,
    centerJudge?: string,
    linesman?: string,
    fieldJudge?: string
  }
}
```

---

## Why This Works Better as a Dedicated App (vs. Building in n8n)

### 1. **Complex Browser Automation Requirements**

**Challenge:** College sports websites are heavily JavaScript-dependent with:
- Dynamic content loading (AJAX)
- Single Page Applications (SPAs)
- Anti-bot protections
- Iframe-embedded content
- Client-side rendering

**Why n8n Struggles:**
- n8n's HTTP Request node only fetches static HTML
- No JavaScript execution or DOM rendering
- Cannot handle dynamic content loading
- No support for browser automation tools like Playwright/Puppeteer
- Limited to simple HTTP requests

**Dedicated App Solution:**
```typescript
// Playwright handles all complexity:
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.schedule-table', { timeout: 8000 });
await page.waitForTimeout(5000); // Wait for AJAX
const html = await page.content(); // Fully rendered HTML
```

### 2. **Stateful Scraping Sessions**

**Challenge:** The scraping process requires maintaining context across multiple steps:
- Browser session persistence
- Cookie management
- Multi-page navigation (schedule → boxscore)
- Screenshot correlation with HTML

**Why n8n Struggles:**
- Each n8n node is stateless
- No shared browser session between nodes
- Difficult to maintain context across workflow steps
- Cookie/session handling is manual and error-prone

**Dedicated App Solution:**
- Playwright maintains a single browser context throughout the scrape
- Cookies and sessions automatically managed
- Screenshots tied to specific page states
- Clean lifecycle management (init → scrape → cleanup)

### 3. **AI Model Orchestration**

**Challenge:** Intelligent extraction requires:
- Structured output schemas
- Multi-provider support (Gemini, OpenAI, Anthropic)
- Token usage tracking
- Cost monitoring
- Response validation
- Error handling with fallbacks

**Why n8n Struggles:**
- Limited AI node customization
- No structured output guarantees
- Manual schema validation required
- Cost tracking across nodes is difficult
- Provider switching requires workflow changes

**Dedicated App Solution:**
```typescript
// Centralized AI abstraction with schema enforcement:
const extractor = new GeminiExtractor();
const result = await extractor.extractGameLink(html, date, school);
// Returns guaranteed structured output matching TypeScript interface
```

### 4. **Specialized Retry Logic & Error Handling**

**Challenge:** Web scraping requires sophisticated error handling:
- Network timeouts
- Page load failures
- Selector not found
- AI extraction errors
- Partial data scenarios
- Exponential backoff

**Why n8n Struggles:**
- Basic retry is node-level only
- No exponential backoff
- Error context lost between nodes
- Difficult to implement conditional retries
- No centralized error logging

**Dedicated App Solution:**
```typescript
// Sophisticated retry with context preservation:
async fetchWithRetry(url: string, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await this.fetchPage(url);
    } catch (error) {
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
        await sleep(delay);
      }
    }
  }
  throw new Error(`Failed after ${maxRetries} attempts: ${lastError}`);
}
```

### 5. **Performance & Resource Management**

**Challenge:** Efficient scraping requires:
- Browser instance pooling
- Memory management
- Concurrent request handling
- Connection pooling
- Resource cleanup

**Why n8n Struggles:**
- No browser instance reuse
- Each execution spawns new processes
- Memory leaks from unclosed browsers
- No connection pooling
- Resource cleanup is manual

**Dedicated App Solution:**
- Single browser instance reused across requests
- Proper cleanup in finally blocks
- Memory-efficient page management
- Connection pooling at HTTP client level
- Automatic resource disposal

### 6. **Centralized Configuration Management**

**Challenge:** Supporting multiple schools requires:
- School-specific URLs
- Different wait selectors
- Custom parsing rules
- Sport variations
- Conference-specific formats

**Why n8n Struggles:**
- Configuration scattered across nodes
- Difficult to maintain consistency
- Changes require workflow updates
- No centralized config validation

**Dedicated App Solution:**
```json
// schools.json - Single source of truth:
{
  "seminoles.com": {
    "name": "Florida State Seminoles",
    "scheduleUrl": "https://seminoles.com/sports/football/schedule",
    "waitForSelector": ".sidearm-schedule-games-container",
    "sport": "football"
  }
}
```

### 7. **Development & Debugging Experience**

**Challenge:** Complex scraping requires:
- Step-by-step debugging
- Console logging
- Screenshot inspection
- HTML diff analysis
- Performance profiling

**Why n8n Struggles:**
- Limited debugging tools
- Black-box node execution
- Difficult to inspect intermediate states
- No IDE integration
- Limited logging capabilities

**Dedicated App Solution:**
- Full IDE support (VSCode, breakpoints)
- Rich console logging with timestamps
- Screenshot debugging
- TypeScript type safety
- Unit testable components

### 8. **API Flexibility & Integration**

**Challenge:** Integration requirements:
- Sync and async endpoints
- Webhook responses
- Job status tracking
- Batch processing
- Rate limiting

**Why n8n Struggles:**
- Limited to workflow trigger types
- No built-in job queue
- Difficult to implement async patterns
- Status tracking requires external storage

**Dedicated App Solution:**
```typescript
// Full REST API with Express:
POST /scrape        → Returns requestId immediately (async)
POST /scrape-sync   → Waits for result (sync)
GET /status/:id     → Check job status
GET /jobs           → List all jobs
GET /health         → Health check
```

### 9. **Version Control & Deployment**

**Challenge:** Production deployment needs:
- Git version control
- CI/CD pipelines
- Docker containerization
- Environment management
- Rollback capabilities

**Why n8n Struggles:**
- Workflows stored in database
- JSON exports for version control
- Difficult to diff changes
- No native Docker optimization
- Environment variables per workflow

**Dedicated App Solution:**
- Full Git workflow (branches, PRs, reviews)
- Dockerfile optimized for production
- Docker Compose for local development
- Environment-based configuration
- Easy rollback via Git

### 10. **Cost Efficiency & Monitoring**

**Challenge:** Production monitoring requires:
- Token usage tracking
- Cost per request
- Performance metrics
- Error rate monitoring
- Provider comparison

**Why n8n Struggles:**
- Limited metrics collection
- No built-in cost tracking
- Difficult to aggregate across nodes
- No provider comparison tools

**Dedicated App Solution:**
```typescript
// Built-in cost tracking:
{
  metadata: {
    processingTime: 6044,
    cost: 0.0023,
    provider: "gemini",
    model: "gemini-flash-lite-latest",
    tokensUsed: 4589,
    operations: 2
  }
}
```

---

## Summary: When to Use Each Approach

### Use n8n When:
- ✅ Simple HTTP API calls
- ✅ Connecting existing APIs together
- ✅ Basic data transformations
- ✅ No complex state management needed
- ✅ Rapid prototyping

### Use a Dedicated App When:
- ✅ Browser automation required (Playwright/Puppeteer)
- ✅ Complex multi-step workflows with state
- ✅ AI model orchestration with schemas
- ✅ Custom retry/error handling logic
- ✅ Performance optimization critical
- ✅ Resource management important (memory, connections)
- ✅ Need full debugging capabilities
- ✅ Production-grade monitoring required
- ✅ Version control and CI/CD needed
- ✅ Reusable API for multiple consumers

**For this officials scraper:** The dedicated app approach is clearly superior due to the complex browser automation, stateful scraping sessions, AI orchestration, and production requirements. Building this in n8n would result in a fragile, difficult-to-maintain solution with poor performance and limited debugging capabilities.

---

## Docker Deployment

The app is fully containerized for easy deployment:

```bash
# Local testing
docker-compose up --build

# Access API
http://localhost:8080/health
POST http://localhost:8080/scrape-sync

# For production (AWS EC2, ECS, etc.)
See DEPLOYMENT.md for detailed instructions
```

The Dockerfile includes:
- Multi-stage build for optimization
- Alpine Linux for small image size
- System Chromium for Playwright
- Production-ready configuration
- Health checks
- Proper signal handling

---

## Additional Resources

- **README.md** - Setup and basic usage
- **DEPLOYMENT.md** - Production deployment guide (AWS EC2, ECS, Docker)
- **src/config/schools.json** - School configurations
- **.env** - Environment configuration

For questions or issues, refer to the main README or create an issue in the repository.
