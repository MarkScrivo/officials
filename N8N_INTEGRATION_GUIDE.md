# n8n Integration Guide for Officials Scraper API

## Overview
The Officials Scraper API is now running as a service that n8n can call via HTTP requests. This enables workflow orchestration, MongoDB integration, and automated scheduling.

## API Endpoints

### 🏥 Health Check
```
GET http://localhost:3000/health
```
**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-09-29T22:52:10.491Z",
  "version": "1.0.0",
  "uptime": 59.088676875
}
```

### 🏈 Synchronous Scraping (for simple workflows)
```
POST http://localhost:3000/scrape-sync
Content-Type: application/json

{
  "schoolDomain": "gobearcats.com",
  "gameDate": "09/06/25",
  "provider": "gemini",    // optional: gemini, openai, anthropic
  "model": "gemini-flash-lite-latest"  // optional: any model name
}
```

**Response:** (57 seconds processing time)
```json
{
  "success": true,
  "requestId": "uuid-here",
  "timestamp": "2025-09-29T22:53:22.776Z",
  "data": {
    "school": "Gobearcats",
    "game": {
      "date": "Sat, Sep 6",
      "opponent": "Bowling Green",
      "location": "Cincinnati, Ohio / Nippert Stadium",
      "time": "12:00 PM EDT",
      "boxscoreUrl": "https://gobearcats.com/boxscore/3881"
    },
    "officials": {
      "referee": "Kevin Mar",
      "lineJudge": "Scott Reilly",
      "sideJudge": "JB Garza",
      "umpire": "Bill Bishop",
      "backJudge": "Sean Woodson",
      "linesman": "Bradford Edwards",
      "fieldJudge": "Randy Smith",
      "centerJudge": null
    }
  },
  "metadata": {
    "processingTime": 57443,
    "cost": 0.123,
    "provider": "gemini",
    "model": "gemini-flash-lite-latest",
    "tokensUsed": 1230721,
    "operations": 2
  }
}
```

### 🔄 Asynchronous Scraping (for complex workflows)
```
POST http://localhost:3000/scrape
Content-Type: application/json

{
  "schoolDomain": "seminoles.com",
  "gameDate": "09/06/25"
}
```

**Immediate Response:**
```json
{
  "requestId": "54ee3444-b437-4c50-90db-29e37495d762",
  "status": "accepted",
  "message": "Scraping job started",
  "statusUrl": "/status/54ee3444-b437-4c50-90db-29e37495d762"
}
```

### 📊 Check Job Status
```
GET http://localhost:3000/status/{requestId}
```

**Response:**
```json
{
  "requestId": "54ee3444-b437-4c50-90db-29e37495d762",
  "status": "completed",  // pending, running, completed, failed
  "startTime": "2025-09-29T22:53:49.489Z",
  "endTime": "2025-09-29T22:54:34.711Z",
  "result": {
    // Same format as sync response
  }
}
```

### 📋 List All Jobs
```
GET http://localhost:3000/jobs
```

## n8n Workflow Examples

### Simple Synchronous Workflow
1. **HTTP Request Node**
   - Method: POST
   - URL: `http://localhost:3000/scrape-sync`
   - Headers: `Content-Type: application/json`
   - Body:
     ```json
     {
       "schoolDomain": "{{ $node.input.first().json.schoolDomain }}",
       "gameDate": "{{ $node.input.first().json.gameDate }}"
     }
     ```

2. **MongoDB Node**
   - Operation: Insert
   - Collection: `officials_data`
   - Data: `{{ $node.HTTP_Request.json }}`

### Advanced Asynchronous Workflow
1. **HTTP Request Node** (Start Job)
   - POST to `/scrape`
   - Store `requestId` in workflow data

2. **Wait Node**
   - Wait 60 seconds for processing

3. **HTTP Request Node** (Check Status)
   - GET `/status/{{ $workflow.requestId }}`
   - Loop until status = "completed"

4. **If Node** (Check Success)
   - Condition: `{{ $node.Check_Status.json.result.success === true }}`

5. **MongoDB Node** (Store Results)
   - Insert successful results

6. **Slack/Email Node** (Notifications)
   - Send success/failure notifications

## Database Schema for MongoDB

```javascript
{
  _id: ObjectId,
  requestId: "uuid-string",
  timestamp: "2025-09-29T22:53:22.776Z",
  school: "Gobearcats",
  game: {
    date: "Sat, Sep 6",
    opponent: "Bowling Green",
    location: "Cincinnati, Ohio / Nippert Stadium",
    time: "12:00 PM EDT",
    boxscoreUrl: "https://gobearcats.com/boxscore/3881"
  },
  officials: {
    referee: "Kevin Mar",
    lineJudge: "Scott Reilly",
    sideJudge: "JB Garza",
    umpire: "Bill Bishop",
    backJudge: "Sean Woodson",
    linesman: "Bradford Edwards",
    fieldJudge: "Randy Smith",
    centerJudge: null
  },
  metadata: {
    processingTime: 57443,
    cost: 0.123,
    provider: "gemini",
    model: "gemini-flash-lite-latest",
    tokensUsed: 1230721,
    operations: 2
  },
  createdAt: new Date()
}
```

## Scheduling & Automation

### Weekly Schedule Scraping
1. **Schedule Trigger**
   - Cron: `0 9 * * MON` (Every Monday at 9 AM)

2. **Function Node** (Generate School List)
   ```javascript
   const schools = [
     { domain: "seminoles.com", date: "09/06/25" },
     { domain: "gobearcats.com", date: "09/06/25" },
     // Add more schools
   ];
   return schools.map(school => ({ json: school }));
   ```

3. **Split in Batches Node**
   - Batch Size: 3 (to avoid overwhelming the API)

4. **HTTP Request Node** (Scrape Each School)
   - Loop through each school

5. **MongoDB Node** (Store All Results)

## Error Handling

### API Error Responses
```json
{
  "error": "Invalid request",
  "details": ["gameDate is required and must be a string"]
}
```

### n8n Error Handling
- Add **If Node** to check for success: `{{ $node.HTTP_Request.json.success === true }}`
- Use **Error Trigger** to handle failed requests
- Implement retry logic with **Wait** and **Loop** nodes

## Starting the API Service

```bash
# Start the API server
npm run api

# For development with auto-restart
npm run api-dev
```

The API will be available at `http://localhost:3000`

## Benefits of This Architecture

✅ **Separation of Concerns**: Complex scraping logic stays in Node.js, n8n handles workflows  
✅ **Job Tracking**: Full visibility into all scraping operations  
✅ **Cost Analytics**: Track AI usage and costs over time  
✅ **Easy Integration**: MongoDB, Slack, email notifications  
✅ **Scheduling**: Automated weekly/monthly scraping  
✅ **Error Handling**: Robust retry and notification systems  
✅ **Scalability**: Handle multiple concurrent requests  
✅ **Monitoring**: Health checks and job status tracking  

This setup gives you the power of sophisticated browser automation + the convenience of n8n workflow orchestration!