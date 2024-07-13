const mongoose = require('mongoose');

// Define the schema for transactions
const transactionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', 
        required: true
    },
    type: {
        type: String,
        enum: ['income', 'expense'],
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    category: {
        type: String,
        required: true
    },
    note: String,
    date: {
        type: Date,
        required: true
    }
});

// Create the Transaction model based on the schema
const Transaction = mongoose.model('Transaction', transactionSchema);

module.exports = Transaction;
