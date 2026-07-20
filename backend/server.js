const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
require('dotenv').config();

const pool = require('./config/database');
const errorHandler = require('./middleware/errorHandler');

// Import routes
const projectsRouter = require('./routes/projects');
const customersRouter = require('./routes/customers');
const employeesRouter = require('./routes/employees');
const schedulesRouter = require('./routes/schedules');
const reportsRouter = require('./routes/reports');
const dashboardRouter = require('./routes/dashboard');
const tasksRouter = require('./routes/tasks'); // <-- Thêm dòng này

const app = express();
const taskActionsRouter = require('./routes/task-actions');
// Middleware
app.use(helmet());
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('combined'));

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Error acquiring client', err.stack);
    process.exit(1);
  }
  console.log('✅ Database connected successfully');
  release();
});

// Health check
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'OK', database: 'connected', version: '2.2.0', timestamp: new Date().toISOString(), uptime: process.uptime() });
  } catch (error) {
    res.status(503).json({ status: 'ERROR', database: 'disconnected', message: error.message });
  }
});

// API Routes
app.use('/api/projects', projectsRouter);
app.use('/api/customers', customersRouter);
app.use('/api/employees', employeesRouter);
app.use('/api/schedules', schedulesRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/tasks', taskActionsRouter);
app.use('/api/tasks', tasksRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found'
  });
});

// Error handler
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════╗
║                                                        ║
║   🚀 Production Management API Server                 ║
║                                                        ║
║   Port: ${PORT}                                           ║
║   Environment: ${process.env.NODE_ENV || 'development'}                              ║
║   Time: ${new Date().toLocaleString('vi-VN')}   ║
║                                                        ║
╚════════════════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    pool.end(() => {
      console.log('Database pool closed');
      process.exit(0);
    });
  });
});