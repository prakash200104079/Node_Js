const express = require('express');
const mongoose = require('mongoose');
const Product = require('./models/product.model.js')
const app = express()

app.use(express.json());

const mongoURI = 'mongodb+srv://prakashraj:*123Mongodb@backenddb.jgkfe9n.mongodb.net/Node-API?retryWrites=true&w=majority&appName=BackendDB';

// Connect to MongoDB
mongoose.connect(mongoURI)
.then(() => {
        console.log('Connected to database!');
        app.listen(3000, () => {
            console.log('Server is running port 3000');
        });
    })
.catch((err) => {
    console.error('Connection to database failed:', err);
});

// Object to track API hits
const hitTracker = {};

// Middleware to track and enforce rate limits
const rateLimiterMiddleware = (req, res, next) => {
    const customer_name = req.body.customer_name;
    const now = Date.now();

    // Clean up hitTracker: Remove entries older than 5 minutes
    for (const name in hitTracker) {
        hitTracker[name] = hitTracker[name].filter(timestamp => now - timestamp <= 5 * 60 * 1000);
        if (hitTracker[name].length === 0) delete hitTracker[name];
    }

    // Check if any customer has exceeded the limit of 2 hits in 5 minutes
    const customerHits = Object.keys(hitTracker).filter(name => hitTracker[name].length >= 2);
    if (customerHits.length >= 2) {
        return res.status(429).json({ message: 'Maximum limit exceeded (2 hits per 5 minutes)' });
    }

    // Check if the specific customer_name has exceeded the limit of 1 hit per 2 minutes
    if (hitTracker[customer_name] && hitTracker[customer_name].length >= 1) {
        return res.status(429).json({ message: 'Maximum limit exceeded (1 hit per 2 minutes)' });
    }

    
    // Track the hit
    if (!hitTracker[customer_name]) {
        hitTracker[customer_name] = [];
    }
    hitTracker[customer_name].push(now);

    // Proceed to the next middleware or route handler
    next();
};


// Helper function to calculate age
function calculateAge(dob) {
    const today = new Date();
    const birthDate = new Date(dob);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }

    return age;
}

// API endpoints

// POST endpoint with rate limiting middleware
app.post('/db-save', rateLimiterMiddleware, async (req, res) => {
    try {
        const { name, dob, income } = req.body;

        // Validate dob (optional)
        const age = calculateAge(dob);
        if (age <= 15) {
            return res.status(400).json({ message: 'Age must be greater than 15.' });
        }

        // Create the product
        const product = await Product.create({
            name,
            dob: new Date(dob),
            income
        });

        res.status(200).json(product);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Middleware to restrict API based on time
const timeRestrictionMiddleware = (req, res, next) => {
    const now = new Date();
    const dayOfWeek = now.getDay(); // Sunday is 0, Monday is 1, ..., Saturday is 6
    const hours = now.getHours();

    // Check if it's Monday (0) or between 8:00 AM (8) and 3:00 PM (15)
    if (dayOfWeek === 1) {
        return res.status(403).json({ message: 'Please do not use this api on monday' });
    }
    if (hours >= 8 && hours < 15) {
        return res.status(403).json({ message: 'Restricted time: Please try after 3pm' });
    }

    next();
};


app.post('/time-based-api', timeRestrictionMiddleware, async (req, res) => {
    try {
        const { name, dob, income } = req.body;

        // Create the product
        const product = await Product.create({
            name,
            dob: new Date(dob),
            income
        });

        res.status(200).json(product);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// GET endpoint to find customer names based on age range (10 to 25 years)
app.get('/db-search', async (req, res) => {
    try {
        const startTime = new Date(); // Start time of API request

        // Calculate birth year for age range calculation
        const today = new Date();
        const maxBirthYear = today.getFullYear() - 10;
        const minBirthYear = today.getFullYear() - 25;

        // Find customers whose age is between 10 and 25
        const customers = await Product.find({
            dob: {
                $gte: new Date(minBirthYear, 0, 1), // January 1st of (current year - 25)
                $lte: new Date(maxBirthYear, 11, 31) // December 31st of (current year - 10)
            }
        });

        const endTime = new Date(); // End time of API request
        const executionTime = (endTime - startTime) / 1000; // Execution time in seconds

        // Extract customer names from the query results
        const customerNames = customers.map(customer => customer.name);

        // Prepare response with customer names and execution time
        const response = {
            customer_names: customerNames,
            execution_time_seconds: executionTime
        };

        res.status(200).json(response);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});


// Default route
app.get('/', (req, res) => {
    res.send("Hello from Node API Server");
});

// Error handling middleware
app.use((err, req, res, next) => {
    if (err.message === 'Maximum limit exceeded (1 hit per 2 minutes)' || err.message === 'Maximum limit exceeded (2 hits per 5 minutes)') {
        res.status(429).json({ message: err.message });
    } else {
        res.status(500).json({ message: 'Internal Server Error' });
    }
});