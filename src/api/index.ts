import { OfficialsApiServer } from './server';
import { validateConfig } from '../config/environment';

async function startApiServer() {
  try {
    console.log('🏈 Starting Officials API Server...');
    
    // Validate configuration
    console.log('🔧 Validating configuration...');
    validateConfig();
    console.log('✅ Configuration valid');
    
    // Create and start server
    const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;
    const server = new OfficialsApiServer(port);
    
    await server.start();
    
    // Graceful shutdown handling
    process.on('SIGTERM', async () => {
      console.log('🔄 Received SIGTERM, shutting down gracefully...');
      await server.stop();
      process.exit(0);
    });
    
    process.on('SIGINT', async () => {
      console.log('🔄 Received SIGINT, shutting down gracefully...');
      await server.stop();
      process.exit(0);
    });
    
  } catch (error) {
    console.error('❌ Failed to start API server:', error);
    process.exit(1);
  }
}

// Start server if this file is run directly
if (require.main === module) {
  startApiServer();
}

export { startApiServer };