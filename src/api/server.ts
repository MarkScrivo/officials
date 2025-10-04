import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { v4 as uuidv4 } from 'uuid';
import { OfficialsScraper } from '../scrapers/officials-scraper';
import { ScrapeRequest, ScrapeResult } from '../models/officials';
import { validateConfig } from '../config/environment';

// Types for API
interface ScrapeApiRequest {
  schoolDomain: string;
  gameDate: string;
  provider?: 'gemini' | 'openai' | 'anthropic';
  model?: string;
}

interface ScrapeApiResponse {
  success: boolean;
  requestId: string;
  timestamp: string;
  data?: {
    school: string;
    game: any;
    officials: any;
  };
  metadata?: {
    processingTime: number;
    cost: number;
    provider: string;
    model: string;
    tokensUsed: number;
    operations: number;
  };
  error?: string;
}

interface JobStatus {
  requestId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startTime: string;
  endTime?: string;
  result?: ScrapeApiResponse;
  error?: string;
}

// In-memory job tracking (could be replaced with Redis for production)
const jobs = new Map<string, JobStatus>();

class OfficialsApiServer {
  private app: express.Application;
  private server: any;
  private port: number;

  constructor(port: number = 3000) {
    this.port = port;
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // Security and logging middleware
    this.app.use(helmet());
    this.app.use(cors());
    this.app.use(morgan('combined'));
    this.app.use(express.json());

    // Request size limit
    this.app.use(express.json({ limit: '10mb' }));
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        uptime: process.uptime()
      });
    });

    // Get job status
    this.app.get('/status/:requestId', (req, res) => {
      const { requestId } = req.params;
      const job = jobs.get(requestId);

      if (!job) {
        return res.status(404).json({
          error: 'Job not found',
          requestId
        });
      }

      res.json(job);
    });

    // List all jobs (for debugging)
    this.app.get('/jobs', (req, res) => {
      const allJobs = Array.from(jobs.values()).map(job => ({
        requestId: job.requestId,
        status: job.status,
        startTime: job.startTime,
        endTime: job.endTime
      }));

      res.json({
        jobs: allJobs,
        count: allJobs.length
      });
    });

    // Main scraping endpoint
    this.app.post('/scrape', async (req, res) => {
      try {
        // Validate request
        const validation = this.validateScrapeRequest(req.body);
        if (!validation.valid) {
          return res.status(400).json({
            error: 'Invalid request',
            details: validation.errors
          });
        }

        const scrapeRequest: ScrapeApiRequest = req.body;
        const requestId = uuidv4();

        // Create job entry
        const job: JobStatus = {
          requestId,
          status: 'pending',
          startTime: new Date().toISOString()
        };
        jobs.set(requestId, job);

        // Send immediate response with job ID
        res.status(202).json({
          requestId,
          status: 'accepted',
          message: 'Scraping job started',
          statusUrl: `/status/${requestId}`
        });

        // Start scraping in background
        this.processScrapeJob(requestId, scrapeRequest);

      } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({
          error: 'Internal server error',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Synchronous scrape endpoint (for simple cases)
    this.app.post('/scrape-sync', async (req, res) => {
      try {
        // Validate request
        const validation = this.validateScrapeRequest(req.body);
        if (!validation.valid) {
          return res.status(400).json({
            error: 'Invalid request',
            details: validation.errors
          });
        }

        const scrapeRequest: ScrapeApiRequest = req.body;
        const requestId = uuidv4();

        // Set timeout for synchronous requests
        req.setTimeout(180000); // 3 minutes

        // Process immediately and return result
        const result = await this.executeScrape(requestId, scrapeRequest);
        res.json(result);

      } catch (error) {
        console.error('Sync API Error:', error);
        res.status(500).json({
          error: 'Internal server error',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Catch-all error handler
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Endpoint not found',
        path: req.path
      });
    });
  }

  private validateScrapeRequest(body: any): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];

    if (!body.schoolDomain || typeof body.schoolDomain !== 'string') {
      errors.push('schoolDomain is required and must be a string');
    }

    if (!body.gameDate || typeof body.gameDate !== 'string') {
      errors.push('gameDate is required and must be a string');
    }

    if (body.provider && !['gemini', 'openai', 'anthropic'].includes(body.provider)) {
      errors.push('provider must be one of: gemini, openai, anthropic');
    }

    if (body.model && typeof body.model !== 'string') {
      errors.push('model must be a string');
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  private async processScrapeJob(requestId: string, request: ScrapeApiRequest): Promise<void> {
    const job = jobs.get(requestId)!;
    
    try {
      // Update job status
      job.status = 'running';
      jobs.set(requestId, job);

      // Execute scrape
      const result = await this.executeScrape(requestId, request);

      // Update job with result
      job.status = 'completed';
      job.endTime = new Date().toISOString();
      job.result = result;
      jobs.set(requestId, job);

    } catch (error) {
      console.error(`Job ${requestId} failed:`, error);
      
      // Update job with error
      job.status = 'failed';
      job.endTime = new Date().toISOString();
      job.error = error instanceof Error ? error.message : 'Unknown error';
      jobs.set(requestId, job);
    }
  }

  private async executeScrape(requestId: string, request: ScrapeApiRequest): Promise<ScrapeApiResponse> {
    const startTime = Date.now();

    // Temporarily override environment variables if specified
    const originalProvider = process.env.AI_PROVIDER;
    const originalModel = process.env.AI_MODEL;

    if (request.provider) {
      process.env.AI_PROVIDER = request.provider;
    }
    if (request.model) {
      process.env.AI_MODEL = request.model;
    }

    try {
      // Validate configuration
      validateConfig();

      // Create a fresh scraper instance for each request, exactly like CLI
      const scraper = new OfficialsScraper();

      try {
        // Execute scrape
        const scrapeRequest: ScrapeRequest = {
          schoolDomain: request.schoolDomain,
          gameDate: request.gameDate,
          sport: 'football'
        };

        const result: ScrapeResult = await scraper.scrape(scrapeRequest);

        // Get token usage
        const tokenSummary = scraper.extractor.tokenTracker.getSummary();

        // Build API response
        const apiResponse: ScrapeApiResponse = {
          success: result.success,
          requestId,
          timestamp: new Date().toISOString(),
          metadata: {
            processingTime: Date.now() - startTime,
            cost: tokenSummary.totalCost,
            provider: process.env.AI_PROVIDER || 'gemini',
            model: process.env.AI_MODEL || 'gemini-flash-latest',
            tokensUsed: tokenSummary.totalTokens,
            operations: tokenSummary.operationCount
          }
        };

        if (result.success && result.data) {
          apiResponse.data = {
            school: result.data.school,
            game: result.data.game,
            officials: result.data.officials
          };
        } else {
          apiResponse.error = result.error || 'Scraping failed';
        }

        return apiResponse;

      } finally {
        // Close the scraper after each request, exactly like CLI
        await scraper.close();
      }

    } finally {
      // Restore original environment variables
      if (originalProvider) {
        process.env.AI_PROVIDER = originalProvider;
      }
      if (originalModel) {
        process.env.AI_MODEL = originalModel;
      }
    }
  }

  public start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, () => {
        console.log(`🚀 Officials API Server running on port ${this.port}`);
        console.log(`📊 Health check: http://localhost:${this.port}/health`);
        console.log(`🏈 Scrape endpoint: POST http://localhost:${this.port}/scrape`);
        resolve();
      });
    });
  }

  public async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('🛑 API Server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

export { OfficialsApiServer, ScrapeApiRequest, ScrapeApiResponse };