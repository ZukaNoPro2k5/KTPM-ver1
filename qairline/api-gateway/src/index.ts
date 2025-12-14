import express, { Request, Response } from 'express';
import cors from 'cors';
import { createProxyMiddleware } from 'http-proxy-middleware';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN;

// Middleware
app.use(cors({
  origin: FRONTEND_ORIGIN || true,
  credentials: true
}));

// Rate Limiting: 100 requests per 15 minutes
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes)
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: {
    status: 429,
    error: 'Too many requests, please try again later.'
  }
});

// Apply the rate limiting middleware to all requests
app.use(limiter);

// KHÔNG parse JSON ở gateway - để proxy forward raw body tới services
// app.use(express.json()); 

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'API Gateway is running', timestamp: new Date().toISOString() });
});

// Proxy to Offer Service (preserve old path casing: /api/Offers)
app.use('/api/Offers', createProxyMiddleware({
  target: process.env.OFFER_SERVICE_URL || 'http://localhost:5004',
  changeOrigin: true,
  onError: (err, req, res) => {
    console.error('Offer Service Error:', err);
    // @ts-ignore
    res.status(502).json({ error: 'Offer service unavailable' });
  }
}));

// Special legacy route handled by Booking Service
app.use('/api/Flights/GetUserFlights', createProxyMiddleware({
  target: process.env.BOOKING_SERVICE_URL || 'http://localhost:5003',
  changeOrigin: true,
  onError: (err, req, res) => {
    console.error('Booking Service Error (GetUserFlights):', err);
    // @ts-ignore
    res.status(502).json({ error: 'Booking service unavailable' });
  }
}));

// Proxy to Flight Service (old path: /api/Flights)
app.use('/api/Flights', createProxyMiddleware({
  target: process.env.FLIGHT_SERVICE_URL || 'http://localhost:5002',
  changeOrigin: true,
  onError: (err, req, res) => {
    console.error('Flight Service Error:', err);
    // @ts-ignore
    res.status(502).json({ error: 'Flight service unavailable' });
  }
}));

// Proxy to Aircrafts (old path group: /api/Aircrafts/*)
app.use('/api/Aircrafts', createProxyMiddleware({
  target: process.env.FLIGHT_SERVICE_URL || 'http://localhost:5002',
  changeOrigin: true,
  onError: (err, req, res) => {
    console.error('Flight Service Error (Aircrafts):', err);
    // @ts-ignore
    res.status(502).json({ error: 'Aircrafts API unavailable' });
  }
}));

// Proxy to Booking Service (old path: /api/Bookings and special: /api/Flights/GetUserFlights is handled inside booking-service)
app.use('/api/Bookings', createProxyMiddleware({
  target: process.env.BOOKING_SERVICE_URL || 'http://localhost:5003',
  changeOrigin: true,
  onError: (err, req, res) => {
    console.error('Booking Service Error:', err);
    // @ts-ignore
    res.status(502).json({ error: 'Booking service unavailable' });
  }
}));

// Proxy to User Service (old paths: /api/auth/* and /api/User/*)
app.use('/api/auth', createProxyMiddleware({
  target: process.env.USER_SERVICE_URL || 'http://localhost:5001',
  changeOrigin: true,
  onError: (err, req, res) => {
    console.error('User Service Error (auth):', err);
    // @ts-ignore
    res.status(502).json({ error: 'User service unavailable' });
  }
}));

app.use('/api/User', createProxyMiddleware({
  target: process.env.USER_SERVICE_URL || 'http://localhost:5001',
  changeOrigin: true,
  onError: (err, req, res) => {
    console.error('User Service Error (user):', err);
    // @ts-ignore
    res.status(502).json({ error: 'User service unavailable' });
  }
}));

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 API Gateway running on port ${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/health`);
});

export default app;
