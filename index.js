const express = require("express");
const { ObjectId } = require("mongodb");

require("dotenv").config();

const moment = require("moment-timezone");
const app = express();
const port = 3000;
const cors = require("cors");

// middleware
app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion } = require("mongodb");

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
    // await client.connect();
    const database = client.db("SwiftRent-DB");
    const userInfoCollection = database.collection("usersInfo");
    const carsCollection = database.collection("cars");
    const bookingsCollection = database.collection("bookings");
    const reviewsCollection = database.collection("reviews");

    //user delete
    app.delete("/user-delete/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userInfoCollection.deleteOne(query);
      res.send(result);
    });
    // get all user data
    app.get("/all-user/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: { $ne: email } };
      const result = await userInfoCollection.find(query).toArray();
      res.send(result);
    });
    //Users related api
    app.post("/add-user", async (req, res) => {
      const user = req.body;
      const query = { "userInfo.email": user?.email };
      const existingUser = await userInfoCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "User already exists" });
      }
      // New User Data with Additional Fields
      const newUser = {
        userInfo: user,
        creationDate: moment().tz("Asia/Dhaka").format("YYYY-MM-DD hh:mm:ss A"),
        isActive: true,
        isBlock: false,
        lastLogin: null,
      };
      const result = await userInfoCollection.insertOne(newUser);
      res.send(result);
    });

    // cars related filter, sort and searching
    app.get("/cars", async (req, res) => {
      try {
        const query = {};
        const { search = "" } = req.query;
        const filter = search?.filter;
        const brand = filter?.filterBrand;
        const type = filter?.carType;
        const fuel = filter?.fuelType;

        const minPrice = filter?.priceRange?.min;
        const maxPrice = filter?.priceRange?.max;
        const sortOption = search?.sortOption;
        // Search (by name)
        if (search?.search) {
          query.name = { $regex: search.search, $options: "i" };
        }

        // Brand filter
        if (brand) {
          const brandArray = Array.isArray(brand) ? brand : [brand];
          query.brand = {
            $in: brandArray.map((b) => new RegExp(`^${b}$`, "i")),
          }; // case-insensitive
        }

        // Type filter
        if (type) {
          const typeArray = Array.isArray(type) ? type : [type];
          query.type = {
            $in: typeArray.map((t) => new RegExp(`^${t}$`, "i")),
          };
        }

        // Fuel filter
        if (fuel) {
          const fuelArray = Array.isArray(fuel) ? fuel : [fuel];
          query.fuel = {
            $in: fuelArray.map((f) => new RegExp(`^${f}$`, "i")),
          };
        }

        //  price filter
        const min =
          minPrice?.toString().trim() !== "" ? Number(minPrice) : null;
        const max =
          maxPrice?.toString().trim() !== "" ? Number(maxPrice) : null;

        if (min !== null && max !== null && !isNaN(min) && !isNaN(max)) {
          query.price = { $gte: min, $lte: max };
        }
        // Only min
        else if (min !== null && !isNaN(min)) {
          query.price = { $gte: min };
        }
        // Only max
        else if (max !== null && !isNaN(max)) {
          query.price = { $lte: max };
        }


        // sorting  here
        switch (sortOption) {
          case "priceAsc":
            sort = { price: 1 };
            break;
          case "priceDesc":
            sort = { price: -1 };
            break;
          case "nameAsc":
            sort = { name: 1 };
            break;
          case "nameDesc":
            sort = { name: -1 };
            break;
          default:
            sort = {};
            break;
        }

        const cars = await carsCollection.find(query).sort(sort).toArray();
      
        res.send(cars);
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch carssssss", error });
      }
    });
    app.get("/carsFilter", async (req, res) => {
      try {
        const cars = await carsCollection.find().toArray();
        res.send(cars);
      } catch (error) {
        res.send({ message: error.message }).status(500);
      }
    });
    // car details api
    app.get("/cars/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const car = await carsCollection.findOne({ _id: new ObjectId(id) });

        if (!car) {
          return res.status(404).send({ message: "Car not found" });
        }

        return res.send(car);
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch car details", error });
      }
    });

    // -----------
    app.patch("/update-last-login", async (req, res) => {
      try {
        const { email } = req.body;
        // Update lastLogin field
        const result = await userInfoCollection.updateOne(
          { "userInfo.email": email },
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
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    app.post("/add-car", async (req, res) => {
      const car = req.body;
      const result = await carsCollection.insertOne(car);
      res.send(result);
    });

    // Booking related API
    app.post("/book-auto", async (req, res) => {
      const booking = req.body;
      const result = await bookingsCollection.insertOne(booking);
      res.send(result);
    });

    //review related api

    // review get api
    app.get("/car/review", async (req, res) => {
      try {
        const review = await reviewsCollection.find().toArray();
        res.send(review);
      } catch (error) {
        res.status(500).send({
          message: "Failed to submit review!",
        });
      }
    });

    app.post("/reviews", async (req, res) => {
      const review = req.body;

      try {
        const result = await reviewsCollection.insertOne(review);
        res.send(result);
      } catch (error) {
        res.status(500).send({
          message: "Failed to submit review!",
        });
      }
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
