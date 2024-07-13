// Importing Modules
const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const session = require("express-session");
const Transaction = require('./models/transaction');
const moment = require('moment'); 

//Create an instance of Express
const app = express();

// Middleware to parse JSON and URL-encoded data
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files from the "public" directory
app.use(express.static('public'));

//Session configuration
app.use(session({
    secret: 'session_key', 
    resave: false,
    saveUninitialized: true
}));

// Connecting to MongoDB
mongoose.connect('mongodb://localhost:27017/FinancialTracker', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

var db = mongoose.connection;
db.on('error', () => console.log("Error in connecting to the Database"));
db.once('open', () => console.log("Connected to Database"));

// Mongoose Schema for User Login
const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true
    },
    password: {
        type: String,
        required: true
    }
});

const User = mongoose.model("User", userSchema);

// Route for the main page 
app.get("/", (req, res) => {
    res.sendFile(__dirname + "/public/login.html");
});

// Route for the signup page
app.get("/signup", (req, res) => {
    res.sendFile(__dirname + "/public/signup.html");
});

// Route to display the add transaction form
app.get('/addTransaction', (req, res) => {
    if (req.session.user) {
        res.sendFile(__dirname + '/public/addTransaction.html');
    } else {
        res.redirect('/'); 
    }
});

//Route for the overview page
app.get('/overview', (req, res) => {
    if (req.session.user) {
        res.sendFile(__dirname + "/public/overview.html");
    } else {
        res.redirect('/'); 
    }
});

// Serve the overview data as JSON
app.get('/overview-data', async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).send("Unauthorized");
        }

        const startOfMonth = moment.utc().startOf('month').toDate();
        const endOfMonth = moment.utc().endOf('month').toDate();

        const transactions = await Transaction.find({
            userId: req.session.user._id,
            date: { $gte: startOfMonth, $lte: endOfMonth },
        }).sort({ date: -1 });

        let totalIncome = 0;
        let totalExpenses = 0;

        transactions.forEach((transaction) => {
            if (transaction.type === 'income') {
                totalIncome += transaction.amount;
            } else if (transaction.type === 'expense') {
                totalExpenses += transaction.amount;
            }
        });

        const netTotal = totalIncome - totalExpenses;

        res.json({
            totalIncome: totalIncome.toFixed(2),
            totalExpenses: totalExpenses.toFixed(2),
            netTotal: netTotal.toFixed(2),
            transactions: transactions.map(transaction => ({
                date: moment(transaction.date).format('YYYY-MM-DD'),
                type: transaction.type,
                amount: transaction.amount.toFixed(2),
                category: transaction.category,
                note: transaction.note,
            })),
        });

    } catch (error) {
        console.error('Error fetching overview:', error);
        res.status(500).json({ error: 'Error fetching overview' });
    }
});

//Route to the charts
app.get('/charts', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/'); // Redirect to login if not authenticated
    }
    return res.sendFile(__dirname + '/public/chart.html');
});

app.get('/chart', async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).send("Unauthorized");
        }

        console.log(`Session User: ${JSON.stringify(req.session.user)}`);

        const selectedMonth = req.query.month || moment().format('YYYY-MM');
        const startOfMonth = moment.utc(selectedMonth).startOf('month').toDate();
        const endOfMonth = moment.utc(selectedMonth).endOf('month').toDate();

        console.log(`Fetching transactions from ${startOfMonth} to ${endOfMonth}`);

        const expensesByCategory = await Transaction.aggregate([
            {
                $match: {
                    userId: new mongoose.Types.ObjectId(req.session.user._id), // Ensure ObjectId is created correctly
                    type: 'expense',
                    date: { $gte: startOfMonth, $lt: endOfMonth }
                }
            },
            {
                $group: {
                    _id: '$category',
                    totalAmount: { $sum: { $toDouble: '$amount' } } // Convert to double
                }
            }
        ]);

        console.log(`Expenses by Category: ${JSON.stringify(expensesByCategory)}`);

        const formattedData = expensesByCategory.map(item => ({
            category: item._id,
            amount: Number(item.totalAmount)
        }));

        res.json(formattedData);
    } catch (error) {
        console.error('Error fetching expenses by category:', error);
        res.status(500).json({ error: 'Error fetching expenses by category' });
    }
});

//Route to fetch onthly overview
app.get('/monthly-overview', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).send("Unauthorized");
    }

    try {
        const monthlyData = await Transaction.aggregate([
            {
                $match: { userId: new mongoose.Types.ObjectId(req.session.user._id) }
            },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m", date: "$date" } },
                    totalIncome: { $sum: { $cond: [{ $eq: ["$type", "income"] }, "$amount", 0] } },
                    totalExpenses: { $sum: { $cond: [{ $eq: ["$type", "expense"] }, "$amount", 0] } },
                }
            },
            { $sort: { _id: -1 } } // Sort by month descending
        ]);

        res.json(monthlyData);
    } catch (error) {
        console.error('Error fetching monthly overview:', error);
        res.status(500).json({ error: 'Error fetching monthly overview' });
    }
});

//Logout 
app.get("/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error("Error destroying session:", err);
            res.status(500).send("Error logging out");
        } else {
            res.redirect('/'); // Redirect to login page after logout
        }
    });
});

// Signup form submission
app.post("/signup", async (req, res) => {
    try {
        const hashedPassword = await bcrypt.hash(req.body.password, 10);
        const newUser = new User({
            email: req.body.email,
            password: hashedPassword
        });
        await newUser.save();
        res.redirect('/');
    } catch (error) {
        console.error("Error during user registration:", error);
        res.status(500).send("Error during user registration");
    }
});

// Login form submission
app.post("/login", async (req, res) => {
    try {
        const user = await User.findOne({ email: req.body.email });
        if (user && await bcrypt.compare(req.body.password, user.password)) {
            // Store user data in session upon successful login
            req.session.user = user;
            res.redirect('/overview');
        } else {
            res.send("Invalid email or password");
        }
    } catch (error) {
        console.error("Error during login:", error);
        res.status(500).send("Error during login");
    }
});

//Addidng a transaction
app.post('/addTransaction', async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).send("Unauthorized");
        }

        console.log(`Session User: ${JSON.stringify(req.session.user)}`);

        const { type, amount, category, note, date } = req.body;
        const newTransaction = new Transaction({
            userId: req.session.user._id, // Correctly set the userId field
            type,
            amount: parseFloat(amount).toFixed(2),
            category,
            note,
            date: new Date(date)
        });

        await newTransaction.save();
        console.log('Transaction added:', newTransaction);

        res.redirect(`/addTransaction?alert=${encodeURIComponent('Transaction added successfully!')}`);
        
    } catch (error) {
        console.error("Error during transaction submission:", error);
        res.status(500).send("Error during transaction submission");
    }
});

//Start server on part 5001
app.listen(5001, () => {
    console.log("Server is running on port 5001");
});
