const bodyParser = require("body-parser");
const express = require("express");
const mongoose = require("mongoose");
const path = require("path");

let app = express();
app.use(express.json());

let public = path.join(__dirname, "public");
app.use(express.static(public));

app.use(bodyParser.urlencoded({ extended: false }));

app.get("/register", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "login.html"));
});

mongoose.connect("mongodb://localhost:27017/registration")
    .then(() => console.log("MongoDB Connected"))
    .catch((e) => console.log("MongoDB Connection Failed", e));

app.listen(8000, () => {
    console.log("Server is running on port 8000");
});

const schema = mongoose.Schema;

const dataschema = new schema({
    username: { type: String, required: true },
    password: { type: String, required: true },
    confirmpassword: { type: String, required: true }
});

const Data = mongoose.model("register", dataschema);

app.post("/submit", async (req, res) => {
    try {
        const { username, password, confirmpassword } = req.body;
        
        if (!username || !password || !confirmpassword) {
            return res.status(400).json({ message: "All fields are required" });
        }

        if (password !== confirmpassword) {
            return res.status(400).json({ message: "Passwords do not match" });
        }

        const newData = new Data({ username, password, confirmpassword });
        await newData.save();

        res.status(201).json({ message: "User registered successfully" });
    } catch (error) {
        res.status(500).json({ message: "Error saving data" });
    }
});

app.post("/login", async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ message: "All fields are required" });
        }

        const user = await Data.findOne({ username });

        if (!user) {
            return res.status(400).json({ message: "User not found" });
        }

        // Plain text password comparison (not recommended for production)
        if (password !== user.password) {
            return res.status(400).json({ message: "Invalid credentials" });
        }

        res.redirect("/dashboard.html"); // Redirect to dashboard on successful login

    } catch (error) {
        res.status(500).json({ message: "Error logging in" });
    }
});

// Define Mongoose Schema and Model
const itemSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    price: {
        type: Number,
        required: true
    },
    quantity: {
        type: Number,
        required: true
    },
    minQuantity: {
        type: Number,
        required: true
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    }
});

const Item = mongoose.model('Item', itemSchema);

app.get("/api/inventory-stats", async (req, res) => {
    try {
        const totalItems = await Item.countDocuments();
        const lowStockItems = await Item.countDocuments({ 
            $expr: { $lt: ["$quantity", "$minQuantity"] } 
        });
        const totalValue = await Item.aggregate([
            { $group: { _id: null, total: { $sum: { $multiply: ["$price", "$quantity"] } } } }
        ]);
        const activeItems = await Item.countDocuments({ quantity: { $gt: 0 } });

        res.json({
            totalItems,
            lowStockItems,
            totalValue: totalValue.length ? totalValue[0].total : 0,
            activeItems
        });
    } catch (err) {
        res.status(500).json({ message: "Error fetching inventory stats", error: err.message });
    }
});


// Get all items
app.get('/api/items', async (req, res) => {
    try {
        const items = await Item.find();
        res.json(items);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Add a new item
app.post('/api/items', async (req, res) => {
    const item = new Item({
        name: req.body.name,
        description: req.body.description,
        price: req.body.price,
        quantity: req.body.quantity,
        minQuantity: req.body.minQuantity
    });

    try {
        const newItem = await item.save();
        res.status(201).json(newItem);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// Fetch a single item by ID
app.get('/api/items/:id', async (req, res) => {
    try {
        const item = await Item.findById(req.params.id);
        if (!item) {
            return res.status(404).json({ message: 'Item not found' });
        }
        res.json(item);
    } catch (error) {
        res.status(500).send({ message: 'Server error' });
    }
});

// Update an item by ID
app.put('/api/items/:id', async (req, res) => {
    try {
        const updatedItem = await Item.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!updatedItem) {
            return res.status(404).json({ message: 'Item not found' });
        }
        res.json(updatedItem);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Delete an item by ID
app.delete('/api/items/:id', async (req, res) => {
    try {
        const deletedItem = await Item.findByIdAndDelete(req.params.id);
        if (!deletedItem) {
            return res.status(404).json({ message: 'Item not found' });
        }
        res.json({ message: 'Item deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Get current items (quantity > 0)
app.get('/api/current-items', async (req, res) => {
    try {
        const items = await Item.find();
        const currentItems = items.filter(item => item.quantity > 0);
        res.json(currentItems);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// API to update item quantity
app.put('/api/current-items/:id/update-quantity', async (req, res) => {
    try {
        const itemId = req.params.id; // MongoDB uses ObjectID, so no need to parse as integer
        const { quantitySold } = req.body;

        // Validate input
        if (!quantitySold || quantitySold <= 0) {
            return res.status(400).json({ error: 'Invalid quantitySold value' });
        }

        // Find the item by ID
        const item = await Item.findById(itemId);
        if (!item) {
            return res.status(404).json({ error: 'Item not found' });
        }

        // Check if there's enough quantity to sell
        if (item.quantity < quantitySold) {
            return res.status(400).json({ error: 'Insufficient quantity' });
        }

        // Update the quantity
        item.quantity -= quantitySold;

        // Save the updated item to the database
        await item.save();

        // Return the updated item
        res.json({ message: 'Quantity updated successfully', item });
    } catch (error) {
        console.error('Error updating item quantity:', error); // Log the error for debugging
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

app.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Error destroying session:', err);
        }
        res.redirect('/register'); // Redirect to login page after logout
    });
});