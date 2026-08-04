const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');
const axios = require('axios'); // For 2Factor API

const MOBILE_JWT_SECRET = process.env.MOBILE_JWT_SECRET || (process.env.JWT_SECRET + '_mobile_app_secret');
const MOBILE_ACCESS_EXPIRY = process.env.JWT_EXPIRES_IN || '24h';
const TWO_FACTOR_API_KEY = process.env.TWO_FACTOR_API_KEY;

// In-memory rate limiter for /employee/login (5 requests per hour per mobile)
const employeeLoginRateLimitMap = new Map();
const RATE_LIMIT_MS = 60 * 60 * 1000; // 1 hour
const MAX_REQUESTS = 5;

// In-memory OTP mock store for development when TWO_FACTOR_API_KEY is missing
const mockOtpStore = new Map();
const sessionToPhoneMap = new Map();

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

exports.login = async (req, res) => {
    try {
        const { mobileNumber } = req.body;
        if (!mobileNumber) {
            return res.status(400).json({ error: 'Mobile number is required', code: 'MOBILE_REQUIRED' });
        }

        // Apply rate limiting
        const rateKey = mobileNumber.trim();
        const now = Date.now();
        const userLimit = employeeLoginRateLimitMap.get(rateKey) || { count: 0, firstRequest: now };

        if (now - userLimit.firstRequest > RATE_LIMIT_MS) {
            userLimit.count = 1;
            userLimit.firstRequest = now;
        } else {
            userLimit.count += 1;
            if (userLimit.count > MAX_REQUESTS) {
                return res.status(429).json({ error: 'Maximum OTP requests exceeded for this hour.', code: 'RATE_LIMITED' });
            }
        }
        employeeLoginRateLimitMap.set(rateKey, userLimit);

        // Find Employee
        const employees = await prisma.employee.findMany({
            where: { phone: rateKey, status: 'Active', exitDate: null },
            include: { company: true }
        });

        if (employees.length === 0 || employees.length > 1) {
            return res.status(403).json({ error: 'Mobile number is not registered or employee is inactive.', code: 'UNAUTHORIZED_MOBILE' });
        }
        
        const employee = employees[0];

        if (!employee.company || employee.company.status !== 'Active') {
            return res.status(403).json({ error: 'Mobile number is not registered or employee is inactive.', code: 'UNAUTHORIZED_MOBILE' });
        }

        // Find associated User record
        const user = await prisma.user.findFirst({
            where: { employeeId: employee.id, status: 'Active' }
        });

        if (!user) {
            return res.status(403).json({ error: 'No active user account found for this employee.', code: 'ACCOUNT_INACTIVE' });
        }

        let sessionId;
        let mockOtp = null;

        if (TWO_FACTOR_API_KEY) {
            // Real 2Factor API Call
            const url = `https://2factor.in/API/V1/${TWO_FACTOR_API_KEY}/SMS/${rateKey}/AUTOGEN/OTP1`;
            const response = await axios.get(url);
            if (response.data.Status !== 'Success') {
                throw new Error('Failed to send OTP via 2Factor');
            }
            sessionId = response.data.Details;
        } else {
            // Mock mode for local dev
            sessionId = `mock_session_${Date.now()}`;
            mockOtp = '123456';
            mockOtpStore.set(sessionId, { otp: mockOtp, attempts: 0, expiresAt: Date.now() + 5 * 60 * 1000 });
        }

        sessionToPhoneMap.set(sessionId, rateKey);

        // Audit Log
        await prisma.auditLog.create({
            data: {
                userId: user.id,
                action: 'MOBILE_OTP_SENT',
                details: `OTP sent to ${rateKey} for employee mobile login. IP: ${req.ip}`,
                module: 'Mobile Auth',
                targetId: 'mobile-app'
            }
        });

        if (mockOtp) console.log(`Mock OTP for ${rateKey}: ${mockOtp}`);

        res.json({
            message: 'OTP sent to mobile',
            sessionId,
            expiresIn: 300
        });

    } catch (error) {
        console.error('Employee Mobile Login Error:', error);
        res.status(500).json({ error: 'Server error during login process', code: 'SERVER_ERROR' });
    }
};

exports.verifyOtp = async (req, res) => {
    try {
        const { sessionId, otp, deviceId, devicePlatform } = req.body;

        if (!sessionId || !otp || !deviceId) {
            return res.status(400).json({ error: 'sessionId, otp, and deviceId are required', code: 'MISSING_PARAMS' });
        }

        let isValid = false;
        let phoneMatched = null;

        if (TWO_FACTOR_API_KEY) {
            // Real 2Factor verification (will return Error if attempt limits exceeded or expired on their end)
            try {
                const url = `https://2factor.in/API/V1/${TWO_FACTOR_API_KEY}/SMS/VERIFY/${sessionId}/${otp}`;
                const response = await axios.get(url);
                if (response.data.Status === 'Success') {
                    isValid = true;
                }
            } catch (err) {
                // If 400 bad request, it could be invalid OTP or expired.
                console.error('2Factor verify error', err.response?.data || err.message);
            }
        } else {
            // Mock mode verification
            const record = mockOtpStore.get(sessionId);
            if (!record) {
                return res.status(400).json({ error: 'Invalid or expired OTP session', code: 'OTP_INVALID' });
            }
            if (Date.now() > record.expiresAt) {
                return res.status(400).json({ error: 'OTP has expired', code: 'OTP_EXPIRED' });
            }
            record.attempts += 1;
            if (record.attempts > 5) {
                return res.status(429).json({ error: 'Maximum OTP attempts exceeded', code: 'OTP_RATE_LIMITED' });
            }
            if (record.otp === String(otp)) {
                isValid = true;
                mockOtpStore.delete(sessionId);
            }
        }

        const mobileNumber = sessionToPhoneMap.get(sessionId);
        if (!mobileNumber) {
            return res.status(400).json({ error: 'Session expired or invalid. Please request a new OTP.', code: 'SESSION_EXPIRED' });
        }

        const employee = await prisma.employee.findFirst({
            where: { phone: mobileNumber },
            include: { company: true }
        });
        const user = employee ? await prisma.user.findFirst({ where: { employeeId: employee.id } }) : null;

        if (!isValid || !user) {
            if (user) {
                await prisma.auditLog.create({
                    data: { userId: user.id, action: 'MOBILE_OTP_FAILED', details: `Failed OTP attempt. IP: ${req.ip}`, module: 'Mobile Auth', targetId: 'mobile-app' }
                });
            }
            return res.status(400).json({ error: 'Invalid OTP', code: 'OTP_INVALID' });
        }

        sessionToPhoneMap.delete(sessionId);

        // Generate Refresh Token
        const rawRefreshToken = crypto.randomBytes(40).toString('hex');
        const refreshTokenHash = hashToken(rawRefreshToken);
        const refreshExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

        // Create Mobile Session
        const session = await prisma.mobileSession.create({
            data: {
                userId: user.id,
                deviceId,
                devicePlatform: devicePlatform || 'Unknown',
                ipAddress: req.ip,
                refreshTokenHash,
                expiresAt: refreshExpiresAt,
                isActive: true
            }
        });

        // Generate Access Token (link to mobileSessionId)
        const accessToken = jwt.sign(
            { id: user.id, companyId: user.companyId, mobileSessionId: session.id },
            MOBILE_JWT_SECRET,
            { expiresIn: MOBILE_ACCESS_EXPIRY }
        );

        await prisma.auditLog.create({
            data: { userId: user.id, action: 'MOBILE_LOGIN_SUCCESS', details: `Employee mobile login verified for device: ${deviceId}. IP: ${req.ip}`, module: 'Mobile Auth', targetId: 'mobile-app' }
        });

        res.json({
            message: 'Authentication successful',
            accessToken,
            refreshToken: rawRefreshToken,
            user: {
                id: employee.id, // Mobile app usually expects employee ID in employee context
                employeeId: employee.employeeId,
                name: employee.name,
                email: employee.email,
                phone: employee.phone,
                designation: employee.designation,
                department: employee.department,
                companyId: employee.companyId
            }
        });

    } catch (error) {
        console.error('Verify OTP Error:', error);
        res.status(500).json({ error: 'Server error during verification', code: 'SERVER_ERROR' });
    }
};

exports.refresh = async (req, res) => {
    // Reuse identical logic from mobileAuthController
    try {
        const { refreshToken, deviceId } = req.body;
        
        if (!refreshToken || !deviceId) {
            return res.status(400).json({ error: 'refreshToken and deviceId are required', code: 'MISSING_PARAMS' });
        }

        const refreshTokenHash = hashToken(refreshToken);

        const session = await prisma.mobileSession.findFirst({
            where: { deviceId, refreshTokenHash, isActive: true },
            include: { user: true }
        });

        if (!session) {
            return res.status(401).json({ error: 'Invalid refresh token or session', code: 'INVALID_REFRESH_TOKEN' });
        }

        if (new Date() > session.expiresAt) {
            return res.status(401).json({ error: 'Refresh token expired. Please login again.', code: 'REFRESH_TOKEN_EXPIRED' });
        }

        const newRawRefreshToken = crypto.randomBytes(40).toString('hex');
        const newRefreshTokenHash = hashToken(newRawRefreshToken);
        const refreshExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        await prisma.mobileSession.update({
            where: { id: session.id },
            data: {
                refreshTokenHash: newRefreshTokenHash,
                expiresAt: refreshExpiresAt,
                lastActiveAt: new Date(),
                ipAddress: req.ip
            }
        });

        const accessToken = jwt.sign(
            { id: session.user.id, companyId: session.user.companyId, mobileSessionId: session.id },
            MOBILE_JWT_SECRET,
            { expiresIn: MOBILE_ACCESS_EXPIRY }
        );

        await prisma.auditLog.create({
            data: { userId: session.user.id, action: 'MOBILE_TOKEN_REFRESH', details: `Employee token refreshed for device: ${deviceId}. IP: ${req.ip}`, module: 'Mobile Auth', targetId: 'mobile-app' }
        });

        res.json({ accessToken, refreshToken: newRawRefreshToken });
    } catch (error) {
        console.error('Refresh Token Error:', error);
        res.status(500).json({ error: 'Server error during token refresh', code: 'SERVER_ERROR' });
    }
};

exports.logout = async (req, res) => {
    try {
        const session = req.mobileSession;
        if (!session) {
            return res.status(400).json({ error: 'No active session found', code: 'NO_SESSION' });
        }

        await prisma.mobileSession.update({
            where: { id: session.id },
            data: { isActive: false }
        });

        await prisma.auditLog.create({
            data: { userId: req.user.id, action: 'MOBILE_LOGOUT', details: `Employee mobile logged out for device: ${session.deviceId}. IP: ${req.ip}`, module: 'Mobile Auth', targetId: 'mobile-app' }
        });

        res.json({ message: 'Logged out successfully' });
    } catch (error) {
        console.error('Logout Error:', error);
        res.status(500).json({ error: 'Server error during logout', code: 'SERVER_ERROR' });
    }
};

exports.logoutAll = async (req, res) => {
    try {
        const userId = req.user.id;

        await prisma.mobileSession.updateMany({
            where: { userId: userId, isActive: true },
            data: { isActive: false }
        });

        await prisma.auditLog.create({
            data: { userId, action: 'MOBILE_LOGOUT_ALL', details: `Employee mobile logged out from all devices. IP: ${req.ip}`, module: 'Mobile Auth', targetId: 'mobile-app' }
        });

        res.json({ message: 'Logged out from all devices successfully' });
    } catch (error) {
        console.error('Logout All Error:', error);
        res.status(500).json({ error: 'Server error during logout all', code: 'SERVER_ERROR' });
    }
};
