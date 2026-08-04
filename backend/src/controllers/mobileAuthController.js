const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const prisma = require('../config/prisma');
const { sendOtpEmail } = require('../services/emailService');

const MOBILE_JWT_SECRET = process.env.MOBILE_JWT_SECRET || (process.env.JWT_SECRET + '_mobile_app_secret');
const MOBILE_ACCESS_EXPIRY = process.env.JWT_EXPIRES_IN || '24h';
const MOBILE_REFRESH_EXPIRY = '30d';
const OTP_EXPIRY_MINUTES = 5;
const MAX_OTP_ATTEMPTS = 5;

// Generate random 6-digit OTP
const generateOtp = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

// In-memory rate limiter for /login endpoint to prevent email spam
const loginRateLimitMap = new Map();
const LOGIN_RATE_LIMIT_MS = 60 * 1000; // 1 minute window
const LOGIN_MAX_REQUESTS = 3;

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required', code: 'CREDENTIALS_REQUIRED' });
        }

        // Apply Login Rate Limiting
        const ip = req.ip || req.connection.remoteAddress;
        const rateKey = `${ip}:${email.toLowerCase()}`;
        const now = Date.now();
        const userLimit = loginRateLimitMap.get(rateKey) || { count: 0, firstRequest: now };
        
        if (now - userLimit.firstRequest > LOGIN_RATE_LIMIT_MS) {
            userLimit.count = 1;
            userLimit.firstRequest = now;
        } else {
            userLimit.count += 1;
            if (userLimit.count > LOGIN_MAX_REQUESTS) {
                return res.status(429).json({ error: 'Too many login requests. Please try again later.', code: 'LOGIN_RATE_LIMITED' });
            }
        }
        loginRateLimitMap.set(rateKey, userLimit);

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password', code: 'INVALID_CREDENTIALS' });
        }

        // Role check
        if (user.role !== 'Company Head' && user.role !== 'HR') {
            return res.status(403).json({ error: 'Access denied. Only Company Head and HR roles can access the mobile app.', code: 'ROLE_NOT_AUTHORIZED' });
        }

        // Status check
        if (user.status && String(user.status).toLowerCase() !== 'active') {
            return res.status(403).json({ error: 'Account is inactive.', code: 'ACCOUNT_INACTIVE' });
        }

        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid email or password', code: 'INVALID_CREDENTIALS' });
        }

        // Generate OTP
        const otp = generateOtp();
        const otpHash = await bcrypt.hash(otp, 10);
        const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

        // Deactivate previous unconsumed OTPs for this user
        await prisma.mobileOtp.updateMany({
            where: { userId: user.id, consumed: false },
            data: { consumed: true }
        });

        // Store OTP
        const mobileOtp = await prisma.mobileOtp.create({
            data: {
                userId: user.id,
                email: user.email,
                otpHash,
                expiresAt,
                attempts: 0,
                consumed: false
            }
        });

        // Send OTP
        await sendOtpEmail(user.email, otp, user.name, OTP_EXPIRY_MINUTES, user.companyId);

        // Audit Log
        await prisma.auditLog.create({
            data: {
                userId: user.id,
                action: 'MOBILE_OTP_SENT',
                details: `OTP sent to ${user.email} for mobile login. IP: ${req.ip}`,
                module: 'Mobile Auth',
                targetId: 'mobile-app'
            }
        });

        res.json({ message: 'OTP sent to email', otpId: mobileOtp.id, expiresIn: OTP_EXPIRY_MINUTES * 60 });
    } catch (error) {
        console.error('Mobile Login Error:', error);
        res.status(500).json({ error: 'Server error during login process', code: 'SERVER_ERROR' });
    }
};

exports.verifyOtp = async (req, res) => {
    try {
        const { otpId, otp, deviceId, devicePlatform } = req.body;
        
        if (!otpId || !otp || !deviceId) {
            return res.status(400).json({ error: 'otpId, otp, and deviceId are required', code: 'MISSING_PARAMS' });
        }

        const mobileOtp = await prisma.mobileOtp.findUnique({ where: { id: parseInt(otpId) } });

        if (!mobileOtp || mobileOtp.consumed) {
            return res.status(400).json({ error: 'Invalid or expired OTP', code: 'OTP_INVALID' });
        }

        if (mobileOtp.attempts >= MAX_OTP_ATTEMPTS) {
            return res.status(429).json({ error: 'Maximum OTP attempts exceeded', code: 'OTP_RATE_LIMITED' });
        }

        if (new Date() > mobileOtp.expiresAt) {
            return res.status(400).json({ error: 'OTP has expired', code: 'OTP_EXPIRED' });
        }

        // Atomically increment attempts to prevent brute-force race conditions
        const updatedOtp = await prisma.mobileOtp.update({
            where: { id: mobileOtp.id },
            data: { attempts: { increment: 1 } }
        });

        if (updatedOtp.attempts > MAX_OTP_ATTEMPTS) {
            return res.status(429).json({ error: 'Maximum OTP attempts exceeded', code: 'OTP_RATE_LIMITED' });
        }

        const isMatch = await bcrypt.compare(otp, mobileOtp.otpHash);
        if (!isMatch) {
            await prisma.auditLog.create({
                data: { userId: mobileOtp.userId, action: 'MOBILE_OTP_FAILED', details: `Failed OTP attempt. IP: ${req.ip}`, module: 'Mobile Auth', targetId: 'mobile-app' }
            });
            return res.status(400).json({ error: 'Invalid OTP', code: 'OTP_INVALID' });
        }

        // Atomically mark as consumed to prevent replay attacks
        const consumptionResult = await prisma.mobileOtp.updateMany({
            where: { id: mobileOtp.id, consumed: false },
            data: { consumed: true }
        });

        if (consumptionResult.count === 0) {
             return res.status(400).json({ error: 'OTP already consumed', code: 'OTP_CONSUMED' });
        }

        const user = await prisma.user.findUnique({ where: { id: mobileOtp.userId } });

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
            data: { userId: user.id, action: 'MOBILE_LOGIN_SUCCESS', details: `Mobile login verified for device: ${deviceId}. IP: ${req.ip}`, module: 'Mobile Auth', targetId: 'mobile-app' }
        });

        res.json({
            message: 'Authentication successful',
            accessToken,
            refreshToken: rawRefreshToken,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                companyId: user.companyId
            }
        });

    } catch (error) {
        console.error('Verify OTP Error:', error);
        res.status(500).json({ error: 'Server error during verification', code: 'SERVER_ERROR' });
    }
};

exports.refresh = async (req, res) => {
    try {
        const { refreshToken, deviceId } = req.body;
        
        if (!refreshToken || !deviceId) {
            return res.status(400).json({ error: 'refreshToken and deviceId are required', code: 'MISSING_PARAMS' });
        }

        const refreshTokenHash = hashToken(refreshToken);

        const session = await prisma.mobileSession.findFirst({
            where: {
                deviceId,
                refreshTokenHash,
                isActive: true
            },
            include: { user: true }
        });

        if (!session) {
            return res.status(401).json({ error: 'Invalid refresh token or session', code: 'INVALID_REFRESH_TOKEN' });
        }

        if (new Date() > session.expiresAt) {
            return res.status(401).json({ error: 'Refresh token expired. Please login again.', code: 'REFRESH_TOKEN_EXPIRED' });
        }

        // Generate new Refresh Token (Rotation)
        const newRawRefreshToken = crypto.randomBytes(40).toString('hex');
        const newRefreshTokenHash = hashToken(newRawRefreshToken);
        const refreshExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

        await prisma.mobileSession.update({
            where: { id: session.id },
            data: {
                refreshTokenHash: newRefreshTokenHash,
                expiresAt: refreshExpiresAt,
                lastActiveAt: new Date(),
                ipAddress: req.ip
            }
        });

        // Generate new Access Token
        const accessToken = jwt.sign(
            { id: session.user.id, companyId: session.user.companyId, mobileSessionId: session.id },
            MOBILE_JWT_SECRET,
            { expiresIn: MOBILE_ACCESS_EXPIRY }
        );

        await prisma.auditLog.create({
            data: { userId: session.user.id, action: 'MOBILE_TOKEN_REFRESH', details: `Token refreshed for device: ${deviceId}. IP: ${req.ip}`, module: 'Mobile Auth', targetId: 'mobile-app' }
        });

        res.json({
            accessToken,
            refreshToken: newRawRefreshToken
        });

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
            data: { userId: req.user.id, action: 'MOBILE_LOGOUT', details: `Mobile logged out for device: ${session.deviceId}. IP: ${req.ip}`, module: 'Mobile Auth', targetId: 'mobile-app' }
        });

        res.json({ message: 'Logged out successfully' });
    } catch (error) {
        console.error('Logout Error:', error);
        res.status(500).json({ error: 'Server error during logout', code: 'SERVER_ERROR' });
    }
};

exports.logoutAll = async (req, res) => {
    try {
        await prisma.mobileSession.updateMany({
            where: { userId: req.user.id, isActive: true },
            data: { isActive: false }
        });

        await prisma.auditLog.create({
            data: { userId: req.user.id, action: 'MOBILE_LOGOUT_ALL', details: `Mobile logged out from all devices. IP: ${req.ip}`, module: 'Mobile Auth', targetId: 'mobile-app' }
        });

        res.json({ message: 'Logged out from all devices successfully' });
    } catch (error) {
        console.error('Logout All Error:', error);
        res.status(500).json({ error: 'Server error during logout all', code: 'SERVER_ERROR' });
    }
};
