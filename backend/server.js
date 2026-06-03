require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./src/routes/authRoutes');
const companyRoutes = require('./src/routes/companyRoutes');
const branchRoutes = require('./src/routes/branchRoutes');
const migrationRoutes = require('./src/routes/migrationRoutes');
const employeeRoutes = require('./src/routes/employeeRoutes');
const leaveRoutes = require('./src/routes/leaveRoutes');
const documentRoutes = require('./src/routes/documentRoutes');
const paymentRoutes = require('./src/routes/paymentRoutes');
const notificationRoutes = require('./src/routes/notificationRoutes');
const payrollRoutes = require('./src/routes/payrollRoutes');
const attendanceRoutes = require('./src/routes/attendanceRoutes');
const userRoutes = require('./src/routes/userRoutes');
const subscriptionPlanRoutes = require('./src/routes/subscriptionPlanRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/migrate', migrationRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/users', userRoutes);
app.use('/api/plans', subscriptionPlanRoutes);

// Basic Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'HRMS Backend is running smoothly.' });
});

// Centralized Error Handling
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err);
  res.status(500).json({ error: 'Internal Server Error', details: err.message });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// trigger nodemon restart
// trigger nodemon restart
