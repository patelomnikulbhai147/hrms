const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const ctrl = require('../controllers/leaveBalanceController');

// Leave Credit Master config
const creditRouter = express.Router();
creditRouter.use(protect);
creditRouter.get('/', ctrl.getConfig);
creditRouter.put('/', ctrl.updateConfig);

// Employee leave wallets
const balanceRouter = express.Router();
balanceRouter.use(protect);
balanceRouter.get('/', ctrl.getBalances);
balanceRouter.post('/accrue', ctrl.accrue);
balanceRouter.put('/:employeeId', ctrl.updateBalance);

module.exports = { creditRouter, balanceRouter };
