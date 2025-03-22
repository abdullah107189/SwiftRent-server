const express = require('express');
require('dotenv').config();

const moment = require('moment-timezone');
const app = express();
const port = 3000;
const cors = require('cors');

// middleware
app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion } = require('mongodb');

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ujjks.mongodb.net/?appName=Cluster0`;
// const uri = 'mongodb://localhost:27017/';

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    const database = client.db('SwiftRent-DB');
    const userInfoCollection = database.collection('usersInfo');
    const carsCollection = database.collection('cars');

    //Users related api
    app.post('/add-user', async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await userInfoCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: 'User already exists' });
      }
      // New User Data with Additional Fields
      const newUser = {
        email: user.email,
        name: user.name,
        creationDate: moment
          .utc()
          .tz("Asia/Dhaka")
          .format("YYYY-MM-DD hh:mm:ss A"),
        role: "user",
        isActive: true,
        isBlock: false,
        lastLogin: null,
      };
      const result = await userInfoCollection.insertOne(newUser);
      res.send(result);
    });

    // cars related apis
    app.get('/cars', async (req, res) => {
      try {
        const cars = await carsCollection.find().toArray();
        return res.send(cars);
      } catch (error) {
        res.send({ message: "Failed to fetch cars", error });
      }
    });

    app.patch("/update-last-login", async (req, res) => {
      try {
        const { email } = req.body;
        // Update lastLogin field
        const result = await userInfoCollection.updateOne(
          { email },
          {
            $set: {
              lastLogin: moment
                .utc()
                .tz("Asia/Dhaka")
                .format("YYYY-MM-DD hh:mm:ss A"),
            },
          }
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({ message: "User not found" });
        }
        res.send({ message: "Last login updated successfully" });
      } catch (error) {
        console.error("Error updating last login:", error);
        res.status(500).send({ message: "Internal Server Err
      }
    });

    app.post('/add-car', async (req, res) => {
      const car = req.body;
      console.log('car', car);
      const result = await carsCollection.insertOne(car);
      console.log(result);
      res.send(result);
    });
    // Send a ping to confirm a successful connection
    await client.db('admin').command({ ping: 1 });
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Hello World dada!');
});
// create development branch

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
