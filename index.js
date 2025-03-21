<<<<<<< HEAD
require('dotenv').config();
const express = require('express');
=======
require("dotenv").config();
const express = require("express");
const moment = require("moment-timezone");
>>>>>>> 4455ead35297790efa65b47ca7edf156c96a7964
const app = express();
const port = 3000;
const cors = require('cors');

// middleware
app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion } = require('mongodb');

// const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ujjks.mongodb.net/?appName=Cluster0`;
const uri = 'mongodb://localhost:27017/';

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
    const database = client.db("SwiftRent-DB");
    const userInfoCollection = database.collection("usersInfo");
    const carsCollection = database.collection("cars");

    //Users related api
    app.post("/add-user", async (req, res) => {
      const user = req.body;

      // Check if the user already exists
      const query = { email: user.email };
      const existingUser = await userInfoCollection.findOne(query);

      if (existingUser) {
        return res.send({ message: "User already exists" });
      }
      // New User Data with Additional Fields
      const newUser = {
        email: user.email,
        name: user.name,
        creationDate: moment
          .utc("2025-03-20T07:51:31.978Z")
          .tz("Asia/Dhaka")
          .format("YYYY-MM-DD hh:mm:ss A"),
        role: "user",
        isActive: true,
        lastLogin: null,
      };
      console.log(newUser);
      const result = await userInfoCollection.insertOne(newUser);
      res.send(result);
    });

    // cars related apis
    app.get("/cars", async (req, res) => {
      try {
        const cars = await carsCollection.find().toArray();
        return res.send(cars);
      } catch (error) {
        res.json({ message: "Failed to fetch cars", error });
      }
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
