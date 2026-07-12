const express = require('express');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
const subscriptionRoutes = require('./routes/subscription.routes');
const paymentRoutes = require('./routes/payment.routes');
const sandboxRoutes = require('./routes/sandbox.routes');
const dashboardRoutes = require('./routes/dashboard.routes');

const app = express();

app.use(express.json({ limit: '2mb' }));

// Swagger UI - docs di http://localhost:3000/api-docs
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'YorFinance API Docs',
}));

// Swagger JSON - http://localhost:3000/api-docs.json
app.get('/api-docs.json', (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

app.get('/health', (_req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

// API Routes
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Sandbox Routes (hanya untuk development)
if (process.env.NODE_ENV !== 'production') {
  app.use('/api/sandbox', sandboxRoutes);
}

// Serve static frontend files from web/
app.use('/web', express.static(path.join(__dirname, '../web')));

// Serve public assets (logo, etc.)
app.use('/public', express.static(path.join(__dirname, '../public')));

// Root redirect to landing page
app.get('/', (_req, res) => res.redirect('/web/index.html'));

// 404 handler
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

module.exports = app;
