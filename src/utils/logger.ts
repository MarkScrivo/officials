import fs from 'fs';
import path from 'path';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

export class Logger {
  private level: LogLevel;
  private logFile: string | null = null;

  constructor(level: string = 'info') {
    this.level = this.parseLogLevel(level);
    this.setupLogFile();
  }

  private parseLogLevel(level: string): LogLevel {
    switch (level.toLowerCase()) {
      case 'debug': return LogLevel.DEBUG;
      case 'info': return LogLevel.INFO;
      case 'warn': return LogLevel.WARN;
      case 'error': return LogLevel.ERROR;
      default: return LogLevel.INFO;
    }
  }

  private setupLogFile(): void {
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().split('T')[0];
    this.logFile = path.join(logsDir, `scraper-${timestamp}.log`);
  }

  private log(level: LogLevel, message: string, data?: any): void {
    if (level < this.level) return;
    
    const timestamp = new Date().toISOString();
    const levelStr = LogLevel[level];
    const logMessage = `[${timestamp}] [${levelStr}] ${message}`;
    
    // Console output
    switch (level) {
      case LogLevel.ERROR:
        console.error(logMessage, data || '');
        break;
      case LogLevel.WARN:
        console.warn(logMessage, data || '');
        break;
      default:
        console.log(logMessage, data || '');
    }
    
    // File output
    if (this.logFile) {
      const fileMessage = data 
        ? `${logMessage}\n${JSON.stringify(data, null, 2)}\n`
        : `${logMessage}\n`;
      
      fs.appendFileSync(this.logFile, fileMessage);
    }
  }

  debug(message: string, data?: any): void {
    this.log(LogLevel.DEBUG, message, data);
  }

  info(message: string, data?: any): void {
    this.log(LogLevel.INFO, message, data);
  }

  warn(message: string, data?: any): void {
    this.log(LogLevel.WARN, message, data);
  }

  error(message: string, data?: any): void {
    this.log(LogLevel.ERROR, message, data);
  }
}

export const logger = new Logger(process.env.LOG_LEVEL || 'info');