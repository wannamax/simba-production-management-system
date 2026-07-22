const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
require('dotenv').config();

const pool = require('./config/database');
const errorHandler = require('./middleware/errorHandler');

const projectsRouter = require('./routes/projects');
const customersRouter = require('./routes/customers');
const employeesRouter = require('./routes/employees');
const schedulesRouter = require('./routes/schedules');
const notificationsRouter = require('./routes/notifications');
const reportsRouter = require('./routes/reports');
const dashboardRouter = require('./routes/dashboard');
const taskActionsRouter = require('./routes/task-actions');
const tasksRouter = require('./routes/tasks');
const dataTransferRouter = require('./routes/data-transfer');
const settingsRouter = require('./routes/settings');
const materialsRouter = require('./routes/materials');
const materialAdminRouter = require('./routes/material-admin');
const materialPlanningRouter = require('./routes/material-planning');
const inventoryRouter = require('./routes/inventory');
const projectCloseoutRouter = require('./routes/project-closeout');
const shopfloorWorkBoardRouter = require('./routes/shopfloor-work-board');
const workCatalogRouter = require('./routes/work-catalog');
const taskExecutionRouter = require('./routes/task-execution');
const ordersRouter = require('./routes/orders');
const productionWorkflowsRouter = require('./routes/production-workflows');
const productionPlansRouter = require('./routes/production-plans');
const appVersion = require('./config/version');

const app = express();

app.use(helmet());
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('combined'));

pool.connect((error, client, release) => {
  if (error) {
    console.error('❌ Error acquiring database client', error.stack);
    process.exit(1);
  }

  console.log('✅ Database connected successfully');
  release();
});

async function healthHandler(req, res) {
  try {
    await pool.query('SELECT 1');

    res.json({
      status: 'OK',
      database: 'connected',
      product: appVersion.product,
      version: appVersion.version,
      display_version: appVersion.display,
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  } catch (error) {
    res.status(503).json({
      status: 'ERROR',
      database: 'disconnected',
      message: error.message
    });
  }
}

// Direct container health check and public API health check.
app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

app.use('/api/projects', projectsRouter);
app.use('/api/customers', customersRouter);
app.use('/api/employees', employeesRouter);
app.use('/api/schedules', schedulesRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/tasks', taskActionsRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/data-transfer', dataTransferRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/materials', materialsRouter);
app.use('/api/material-admin', materialAdminRouter);
app.use('/api/material-planning', materialPlanningRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/project-closeout', projectCloseoutRouter);
app.use('/api/shopfloor-work-board', shopfloorWorkBoardRouter);
app.use('/api/work-catalog', workCatalogRouter);
app.use('/api/task-execution', taskExecutionRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/production-workflows', productionWorkflowsRouter);
app.use('/api/production-plans', productionPlansRouter);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found'
  });
});

app.use(errorHandler);

const PORT = Number(process.env.PORT || 3000);

const server = app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════╗
║                                                        ║
║   🚀 Simba PMS API — Version 2.6.0-I                  ║
║                                                        ║
║   Port: ${PORT}                                           ║
║   Environment: ${process.env.NODE_ENV || 'development'}                              ║
║   Time: ${new Date().toLocaleString('vi-VN')}   ║
║                                                        ║
╚════════════════════════════════════════════════════════╝
  `);
});

let isShuttingDown = false;

function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`${signal} received: closing HTTP server`);

  server.close(() => {
    console.log('HTTP server closed');

    pool.end()
      .then(() => {
        console.log('Database pool closed');
        process.exit(0);
      })
      .catch((error) => {
        console.error('Error closing database pool', error);
        process.exit(1);
      });
  });

  setTimeout(() => {
    console.error('Graceful shutdown timed out');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
