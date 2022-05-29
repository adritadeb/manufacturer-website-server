const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const port = process.env.PORT || 5000;
const app = express();

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.nkvzr.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'Unauthorized access' });
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'Forbidden access' });
        }
        req.decoded = decoded;
        next();
    })
}

async function run() {
    try {
        await client.connect();

        const toolsCollection = client.db('roll-wall').collection('tools');
        const orderCollection = client.db('roll-wall').collection('orders');
        const reviewCollection = client.db('roll-wall').collection('reviews');
        const userCollection = client.db('roll-wall').collection('users');

        const verifyAdmin = async (req, res, next) => {
            const requester = req.decoded.email;
            const requesterAccout = await userCollection.findOne({ email: requester });
            if (requesterAccout.role === 'admin') {
                next();
            }
            else {
                return res.status(403).send({ message: 'Forbidden access' });
            }
        }

        app.post('/create-payment-intent', async (req, res) => {
            const tool = req.body;
            const price = tool.toolPrice;
            const amount = price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });
            res.send({ clientSecret: paymentIntent.client_secret })
        });

        app.get('/tools', async (req, res) => {
            const query = {};
            const tools = await toolsCollection.find(query).toArray();
            res.send(tools);
        });

        app.get('/tool/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) }
            const tool = await toolsCollection.findOne(query);
            res.send(tool);
        });

        app.get('/order/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) }
            const order = await orderCollection.findOne(query);
            res.send(order);
        });

        app.put('/tool/:id', async (req, res) => {
            const id = req.params.id;
            const tool = req.body;
            const filter = { _id: ObjectId(id) };
            const options = { upsert: true };
            const updatedDoc = {
                $set: tool
            }
            const result = await toolsCollection.updateOne(filter, updatedDoc, options);
            res.send(result);
        });

        app.post('/tools', verifyJWT, verifyAdmin, async (req, res) => {
            const tool = req.body;
            const result = await toolsCollection.insertOne(tool);
            res.send(result);
        });

        app.post('/orders', async (req, res) => {
            const order = req.body;
            const result = await orderCollection.insertOne(order);
            res.send(result);
        });

        app.patch('/order/:id', async (req, res) => {
            const id = req.params.id;
            const payment = req.body;
            const filter = { _id: ObjectId(id) };
            const updatedDoc = {
                $set: {
                    paid: true,
                    transactionId: payment.transactionId
                }
            }

            const updatedOrder = await orderCollection.updateOne(filter, updatedDoc);
            res.send(updatedDoc);
        })

        app.get('/orders', verifyJWT, async (req, res) => {
            const email = req.query.email;
            const decodedEmail = req.decoded.email;
            if (email === decodedEmail) {
                const query = { email: email };
                const orders = await orderCollection.find(query).toArray();
                res.send(orders);
            }
        });

        app.get('/manageOrders', verifyJWT, async (req, res) => {
            const result = await orderCollection.find({}).toArray();
            res.send(result);
        });

        app.post('/reviews', async (req, res) => {
            const review = req.body;
            const result = await reviewCollection.insertOne(review);
            res.send(result);
        });

        app.get('/reviews', async (req, res) => {
            const query = {};
            const orders = await reviewCollection.find(query).toArray();
            res.send(orders);
        });

        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = {
                $set: user
            }
            const result = await userCollection.updateOne(filter, updateDoc, options);
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, {
                expiresIn: '1h'
            })
            res.send({ result, token });
        });

        app.get('/users', async (req, res) => {
            const users = await userCollection.find({}).toArray();
            res.send(users);
        });

        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({ email: email });
            const isAdmin = user.role === 'admin';
            res.send({ admin: isAdmin });
        });

        app.put('/user/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const updateDoc = {
                $set: { role: 'admin' }
            }
            const result = await userCollection.updateOne(filter, updateDoc);
            res.send(result);
        });

        app.delete('/order/:email', async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const result = await orderCollection.deleteOne(filter);
            res.send(result);
        });

    }
    finally {

    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Manufacturer server is running');
});

app.listen(port, () => {
    console.log('Listening from port', port);
});