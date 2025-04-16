const express = require("express");
const { ObjectId } = require("mongodb");

const SSLCommerzPayment = require("sslcommerz-lts");

require("dotenv").config();
const moment = require("moment-timezone");
// const jwt = require("jsonwebtoken");
// const cookieParser = require("cookie-parser");
const app = express();
const port = 3000;
const cors = require("cors");
const http = require("http");
const server = http.createServer(app);

const { Server } = require("socket.io");
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

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

const store_id = process.env.STORE_ID;
const store_passwd = process.env.STORE_PASSWD;
const is_live = false; //true for live, false for sandbox

async function run() {
  try {
    // await client.connect();

    const database = client.db("SwiftRent-DB");
    const userInfoCollection = database.collection("usersInfo");
    const carsCollection = database.collection("cars");
    const bookingsCollection = database.collection("bookings");
    const reviewsCollection = database.collection("reviews");
    const aboutCollection = database.collection("about");
    const chatCollection = database.collection("chats");

    // ==== Socket.IO live chat =====

    io.on("connection", (socket) => {
      console.log("User connected");

      // Join room
      socket.on("join", async ({ uid, role }) => {
        socket.join(uid);

        if (role === "Admin") {
          // Send all messages to admin
          const chats = await chatCollection.find().toArray();
          socket.emit("initialMessages", chats);

          // Get list of unique users who sent messages
          const uniqueUsers = await chatCollection
            .aggregate([
              {
                $match: { role: { $ne: "Admin" } }, // Only customers
              },
              {
                $group: {
                  _id: "$senderUid",
                  name: { $first: "$senderName" },
                  photo: { $first: "$senderPhoto" },
                },
              },
            ])
            .toArray();

          socket.emit("userList", uniqueUsers);
        } else {
          // Send only messages relevant to this user
          const chats = await chatCollection
            .find({
              $or: [{ senderUid: uid }, { receiverUid: uid }],
            })
            .toArray();
          socket.emit("initialMessages", chats);
        }
      });

      // Load messages for a specific user (used by Admin)
      socket.on("loadUserMessages", async (userUid) => {
        const chats = await chatCollection
          .find({
            $or: [{ senderUid: userUid }, { receiverUid: userUid }],
          })
          .toArray();

        socket.emit("userMessages", { userUid, chats });
      });

      // Handle chat message
      socket.on("chatMessage", async (msg) => {
        const enrichedMsg = {
          ...msg,
          senderName: msg.senderName || "",
          senderPhoto: msg.senderPhoto || "",
          time: new Date(),
        };

        await chatCollection.insertOne(enrichedMsg);

        if (msg.role === "Admin") {
          io.to(msg.receiverUid).emit("chatMessage", enrichedMsg);
        } else {
          io.emit("chatMessage", enrichedMsg);
        }
      });
    });

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

    app.get("/all-user", async (req, res) => {
      try {
        const users = await userInfoCollection.find().toArray();

        res.status(200).send(users);
      } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).send({ message: "Failed to fetch users" });
      }
    });

    app.get("/users/role/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const result = await userInfoCollection.findOne({
          "userInfo.email": email,
        });

        if (result && result.userInfo && result.userInfo.role) {
          res.send({ role: result.userInfo.role.trim() });
        } else {
          res.status(404).send({ message: "User not found" });
        }
      } catch (error) {
        res.status(500).send({ message: "Server error", error: error.message });
      }
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

    // Get all experts
    app.get("/expert-teammate", async (req, res) => {
      try {
        const experts = await aboutCollection.find().toArray();

        // Shuffle the array
        const shuffledExperts = experts.sort(() => 0.5 - Math.random());

        res.send(shuffledExperts);
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch about", error });
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

server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
