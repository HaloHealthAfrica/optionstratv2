// Worker Manager
// Starts and manages all background workers
import { startSignalProcessor } from './signal-processor.js';
import { startOrderCreator } from './order-creator.js';
import { startPaperExecutor } from './paper-executor.js';
import { startPositionRefresher } from './position-refresher.js';
import { startExitMonitor } from './exit-monitor.js';

const workers = {};

/**
 * Start all workers
 */
export function startAllWorkers() {
  console.log('🚀 Starting all background workers...');
  
  // Signal Processor: Process pending signals every 30 seconds
  workers.signalProcessor = startSignalProcessor(30000);
  
  // Order Creator: Create orders from approved signals every 30 seconds
  workers.orderCreator = startOrderCreator(30000);
  
  // Paper Executor: Execute pending paper orders every 10 seconds
  workers.paperExecutor = startPaperExecutor(10000);
  
  // Position Refresher: Update position prices every 60 seconds
  workers.positionRefresher = startPositionRefresher(60000);
  
  // Exit Monitor: Monitor positions for exit conditions every 60 seconds
  workers.exitMonitor = startExitMonitor(60000);
  
  console.log('✅ All workers started successfully');
  
  return workers;
}

/**
 * Stop all workers
 */
export function stopAllWorkers() {
  console.log('🛑 Stopping all background workers...');
  
  Object.entries(workers).forEach(([name, interval]) => {
    if (interval) {
      clearInterval(interval);
      console.log(`✅ Stopped ${name}`);
    }
  });
  
  console.log('✅ All workers stopped');
}

/**
 * Get worker status
 */
export function getWorkerStatus() {
  return {
    signalProcessor: !!workers.signalProcessor,
    orderCreator: !!workers.orderCreator,
    paperExecutor: !!workers.paperExecutor,
    positionRefresher: !!workers.positionRefresher,
    exitMonitor: !!workers.exitMonitor,
  };
}
