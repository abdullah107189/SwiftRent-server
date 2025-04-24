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
    app.get("/", (req, res) => {
      res.send("Hello World! from server");
    });
    // await client.connect();

    const database = client.db("SwiftRent-DB");
    const userInfoCollection = database.collection("usersInfo");
    const carsCollection = database.collection("cars");
    const bookingsCollection = database.collection("bookings");
    const reviewsCollection = database.collection("reviews");
    const aboutCollection = database.collection("about");
    const chatCollection = database.collection("chats");
    const paymentsCollection = database.collection("payments");
    const driverAssignmentsCollection =
      database.collection("driverAssignments");
    const blogsCollection = database.collection("blogs");
    const commentsCollection = database.collection("comments");

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
    // user role api
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
    //customers role api
    app.get("/customers/:role", async (req, res) => {
      try {
        const role = req.params.role;
        const query = { "userInfo.role": role };
        const result = await userInfoCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Server error", error: error.message });
      }
    });

    //driver role api

    app.get("/drivers/:role", async (req, res) => {
      try {
        const role = req.params.role;
        const query = { "userInfo.role": role };
        const result = await userInfoCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Server error", error: error.message });
      }
    });

    // Get user info by email
    app.get("/user-info/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const query = { "userInfo.email": email };
        const user = await userInfoCollection.findOne(query);

        if (!user) {
          return res.status(404).send({ message: "User not found" });
        }

        res.send(user.userInfo);
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch user info", error });
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

    app.get("/all-cars", async (req, res) => {
      try {
        const users = await carsCollection.find().toArray();

        res.status(200).send(users);
      } catch (error) {
        console.error("Error fetching cars:", error);
        res.status(500).send({ message: "Failed to fetch cars" });
      }
    });
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

    // manage-cars api

    app.get("/manage-cars", async (req, res) => {
      const result = await carsCollection.find().toArray();
      res.send(result);
    });

    // car-status api
    app.patch("/car-status/:id/availability", async (req, res) => {
      const carId = req.params.id;
      const { availability } = req.body;

      try {
        const result = await carsCollection.updateOne(
          { _id: new ObjectId(carId) },
          { $set: { availability } }
        );
        res.send(result);
      } catch (error) {
        console.error(error);
        res
          .status(500)
          .send({ message: "Failed to update car availability", error });
      }
    });

    //car updates api

    app.patch("/cars-update/:id", async (req, res) => {
      const id = req.params.id;
      const carDataUpdate = req.body;
      try {
        const result = await carsCollection.updateOne({
          _id: new ObjectId(id),
        });
        {
          $set: carDataUpdate;
        }
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch car details", error });
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
    //car detelt api
    app.delete("/cars/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await carsCollection.deleteOne(query);
        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to delete car" });
      }
    });
    app.post("/add-car", async (req, res) => {
      const car = req.body;
      const result = await carsCollection.insertOne(car);
      res.send(result);
    });

    // Booking related APIs
    app.post("/book-auto", async (req, res) => {
      const booking = {
        ...req.body,
        driver: "Not Assigned",
        canceledByDrivers: [],
      };

      const result = await bookingsCollection.insertOne(booking);
      res.send(result);
    });

    // get all bookings
    app.get("/bookings/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const bookings = await bookingsCollection.find(query).toArray();
      res.send(bookings);
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

    // Driver related APIs
    app.get("/available-trips", async (req, res) => {
      try {
        const email = req.query.email;
        if (!email) {
          return res.status(400).send({ message: "Email is required" });
        }
        const query = {
          driver: "Not Assigned",
          canceledByDrivers: { $nin: [email] },
        };

        const availableTrips = await bookingsCollection.find(query).toArray();
        res.send(availableTrips);
      } catch (error) {
        res
          .status(500)
          .send({ message: "Failed to fetch available trips", error });
      }
    });

    // Start Trip
    app.post("/start-trip/:id", async (req, res) => {
      const id = req.params.id;
      const { driverEmail } = req.body;

      try {
        // driverAssignments Collection tripStatus Update
        const assignmentUpdate = await driverAssignmentsCollection.updateOne(
          { bookingId: id, driverEmail: driverEmail, tripStatus: "Booked" },
          { $set: { tripStatus: "Started" } }
        );

        if (assignmentUpdate.matchedCount === 0) {
          return res.status(400).send({ message: "Trip cannot be started" });
        }

        // bookings Collection tripStatus Update
        await bookingsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { tripStatus: "Started" } }
        );

        res.send({ message: "Trip started successfully" });
      } catch (error) {
        console.error("Error starting trip:", error);
        res
          .status(500)
          .send({ message: "Failed to start trip", error: error.message });
      }
    });

    // Finish Trip
    app.post("/finish-trip/:id", async (req, res) => {
      const id = req.params.id;
      const { driverEmail } = req.body;

      try {
        // driverAssignments Collection tripStatus UpDate
        const assignmentUpdate = await driverAssignmentsCollection.updateOne(
          { bookingId: id, driverEmail: driverEmail, tripStatus: "Started" },
          { $set: { tripStatus: "Completed" } }
        );

        if (assignmentUpdate.matchedCount === 0) {
          return res.status(400).send({ message: "Trip cannot be finished" });
        }

        // bookings Collection tripStatus Update
        await bookingsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { tripStatus: "Completed" } }
        );

        res.send({ message: "Trip finished successfully" });
      } catch (error) {
        console.error("Error finishing trip:", error);
        res
          .status(500)
          .send({ message: "Failed to finish trip", error: error.message });
      }
    });

    // Get driver assignments by email
    app.get("/driver-assignments/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const query = { driverEmail: email };
        const assignments = await driverAssignmentsCollection
          .find(query)
          .toArray();
        res.send(assignments);
      } catch (error) {
        res
          .status(500)
          .send({ message: "Failed to fetch driver assignments", error });
      }
    });

    // Get trip history for a specific driver
    app.get("/trip-history/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const query = { driverEmail: email, tripStatus: "Completed" };
        const trips = await driverAssignmentsCollection.find(query).toArray();
        res.status(200).send(trips);
      } catch (error) {
        console.error("Error fetching trip history:", error);
        res
          .status(500)
          .send({ message: "Failed to fetch trip history", error });
      }
    });

    // Pick Trip
    app.post("/pick-trip/:id", async (req, res) => {
      const id = req.params.id;
      const { driverEmail } = req.body;

      try {
        // Update the booking if it's still available
        const updateResult = await bookingsCollection.updateOne(
          { _id: new ObjectId(id), driver: "Not Assigned" },
          { $set: { tripStatus: "Booked", driver: "Assigned" } }
        );

        if (updateResult.matchedCount === 0) {
          return res
            .status(400)
            .send({ message: "Trip is no longer available" });
        }

        // Fetch the booking details
        const booking = await bookingsCollection.findOne({
          _id: new ObjectId(id),
        });
        if (!booking) {
          return res.status(404).send({ message: "Booking not found" });
        }

        // Create a new assignment document
        const assignment = {
          bookingId: id,
          driverEmail: driverEmail,
          carName: booking.carName,
          carBrand: booking.carBrand,
          customerName: booking.fullName,
          customerEmail: booking.email,
          customerPhone: booking.phone,
          price: booking.price,
          pickUpLocation: booking.pickUpLocation,
          dropOffLocation: booking.dropOffLocation,
          pickUpDate: booking.pickUpDate,
          returnDate: booking.returnDate,
          additionalNote: booking.additionalNote,
          paymentStatus: booking.paymentStatus,
          tripStatus: "Booked",
          assignmentTime: moment()
            .tz("Asia/Dhaka")
            .format("YYYY-MM-DD hh:mm:ss A"),
        };

        await driverAssignmentsCollection.insertOne(assignment);
        res.send({ message: "Trip picked successfully" });
      } catch (error) {
        console.error("Error picking trip:", error);
        res
          .status(500)
          .send({ message: "Failed to pick trip", error: error.message });
      }
    });

    // Cancel Trip
    app.post("/cancel-trip/:id", async (req, res) => {
      const id = req.params.id;
      const { driverEmail } = req.body;

      try {
        // Check if the booking exists and is still available
        const booking = await bookingsCollection.findOne({
          _id: new ObjectId(id),
        });
        if (!booking) {
          return res.status(404).send({ message: "Booking not found" });
        }
        if (booking.driver !== "Not Assigned") {
          return res.status(400).send({ message: "Trip is already assigned" });
        }

        // Add the driver's email to canceledByDrivers array, avoiding duplicates
        const updateResult = await bookingsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $addToSet: { canceledByDrivers: driverEmail } }
        );

        if (updateResult.modifiedCount === 0) {
          return res.status(400).send({ message: "Failed to cancel trip" });
        }

        res.send({ message: "Trip canceled successfully for this driver" });
      } catch (error) {
        console.error("Error canceling trip:", error);
        res
          .status(500)
          .send({ message: "Failed to cancel trip", error: error.message });
      }
    });

    // Generate a random transaction ID
    function generateTrxId(length = 12) {
      const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      let trxId = "";
      for (let i = 0; i < length; i++) {
        trxId += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return trxId;
    }

    // Get payment history for a specific user
    app.get("/payments/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const payments = await paymentsCollection
        .find(query)
        .sort({ paymentTime: -1 })
        .toArray();
      res.send(payments);
    });

    // Success Payment Callback
    app.post("/payment-success/:tran_id", async (req, res) => {
      try {
        const { tran_id } = req.params;

        // Find the booking info
        const booking = await bookingsCollection.findOne({
          _id: new ObjectId(tran_id),
        });
        if (!booking)
          return res.status(404).json({ message: "Booking not found" });

        // Prepare payment info to store
        const paymentInfo = {
          bookingId: tran_id,
          carName: booking.carName,
          carBrand: booking.carBrand,
          fullName: booking.fullName,
          email: booking.email,
          phone: booking.phone,
          price: booking.price,
          pickUpDate: booking.pickUpDate,
          pickUpLocation: booking.pickUpLocation,
          paymentTime: moment()
            .tz("Asia/Dhaka")
            .format("YYYY-MM-DD hh:mm:ss A"),
          paymentStatus: "Success",
          trxID: generateTrxId(),
        };

        // Save to payments collection
        await paymentsCollection.insertOne(paymentInfo);

        // Update paymentStatus in bookings collection
        await bookingsCollection.updateOne(
          { _id: new ObjectId(tran_id) },
          { $set: { paymentStatus: "Success" } }
        );

        res.redirect(`${process.env.CLIENT_URL}/dashboard/payments`);
        console.log("CLIENT_URL from env:", process.env.CLIENT_URL);
        //payment-success/${tran_id}
      } catch (error) {
        console.error("Payment success saving error:", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    // Failed Payment Callback
    app.post("/payment-fail/:tran_id", async (req, res) => {
      const { tran_id } = req.params;

      try {
        await bookingsCollection.updateOne(
          { _id: new ObjectId(tran_id) },
          { $set: { paymentStatus: "Failed" } }
        );

        res.status(200).json({ message: "Payment failed and handled." });
      } catch (error) {
        console.error("Payment fail handling error:", error);
        res.status(500).json({
          message: "Error handling failed payment",
          error: error.message,
        });
      }
    });

    // Cancel Payment Callback
    app.post("/payment-cancel/:tran_id", async (req, res) => {
      const { tran_id } = req.params;

      try {
        await bookingsCollection.updateOne(
          { _id: new ObjectId(tran_id) },
          { $set: { paymentStatus: "Cancelled" } }
        );

        res
          .status(200)
          .json({ message: "Payment cancelled by user and handled." });
      } catch (error) {
        console.error("Payment cancel handling error:", error);
        res.status(500).json({
          message: "Error handling cancelled payment",
          error: error.message,
        });
      }
    });

    app.post("/create-payment/:bookingId", async (req, res) => {
      console.log("Payment route hit", req.params.bookingId);
      try {
        const { bookingId } = req.params;
        const booking = await bookingsCollection.findOne({
          _id: new ObjectId(bookingId),
        });
        if (!booking)
          return res.status(404).json({ message: "Booking not found" });

        const tran_id = booking._id.toString();
        const total_amount = booking.price;
        const currency = "USD";
        const success_url = `${process.env.SERVER_URL}/payment-success/${tran_id}`;
        const fail_url = `${process.env.SERVER_URL}/payment-fail/${tran_id}`;
        const cancel_url = `${process.env.SERVER_URL}/payment-cancel/${tran_id}`;

        const paymentData = {
          total_amount,
          currency,
          tran_id,
          success_url,
          fail_url,
          cancel_url,
          ipn_url: `${process.env.SERVER_URL}/ipn`,
          shipping_method: "NO",
          product_name: booking.carName,
          product_category: booking.carBrand,
          product_profile: "general",
          cus_name: booking.fullName,
          cus_email: booking.email,
          cus_add1: booking.pickUpLocation,
          cus_phone: booking.phone,
        };

        const sslcommerz = new SSLCommerzPayment(
          store_id,
          store_passwd,
          is_live
        );
        const response = await sslcommerz.init(paymentData);
        return res.json(response);
      } catch (err) {
        console.error("Payment init error:", err);
        return res.status(500).json({ message: "Could not initiate payment" });
      }
    });

    // blogs related api
    app.post("/blogs", async (req, res) => {
      try {
        const { title, category, desc, content, coverImage, date } = req.body;

        if (!title || !category || !desc || !content || !coverImage) {
          return res
            .status(400)
            .json({ message: "All fields including image are required." });
        }

        const newBlog = { title, category, desc, content, coverImage, date };

        const result = await blogsCollection.insertOne(newBlog);
        res.send({ insertedId: result.insertedId });
      } catch (error) {
        console.error("Error inserting blog:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    //  GET /blogs with sort & search
    app.get("/blogs", async (req, res) => {
      const { sort = "newest", category, search = "" } = req.query;

      let sortOption = { date: -1 };
      if (sort === "oldest") {
        sortOption = { date: 1 };
      }

      const query = {};
      if (category) {
        query.category = category;
      }

      if (search) {
        query.$or = [
          { title: { $regex: search, $options: "i" } },
          { desc: { $regex: search, $options: "i" } },
          { content: { $regex: search, $options: "i" } },
        ];
      }

      try {
        const blogs = await blogsCollection
          .find(query)
          .sort(sortOption)
          .toArray();
        res.send(blogs);
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch blogs", error });
      }
    });

    app.get("/blogs/:id", async (req, res) => {
      const blog = await blogsCollection.findOne({
        _id: new ObjectId(req.params.id),
      });
      res.send(blog);
    });

    // DELETE /blogs/:id
    app.delete("/blogs/:id", async (req, res) => {
      try {
        const result = await blogsCollection.deleteOne({
          _id: new ObjectId(req.params.id),
        });

        if (result.deletedCount === 1) {
          res.send({ success: true, message: "Blog deleted successfully." });
        } else {
          res.status(404).send({ success: false, message: "Blog not found." });
        }
      } catch (error) {
        console.error("Error deleting blog:", error);
        res
          .status(500)
          .send({ success: false, message: "Failed to delete blog." });
      }
    });

    // Post a comment
    app.post("/comments", async (req, res) => {
      try {
        const comment = req.body;
        const result = await commentsCollection.insertOne(comment);

        if (result.insertedId) {
          res.status(201).send({ ...comment, _id: result.insertedId });
        } else {
          res.status(500).send({ error: "Failed to insert comment" });
        }
      } catch (error) {
        console.error("Error saving comment:", error);
        res.status(500).send({ error: "Failed to save comment" });
      }
    });

    // Get comments by blog post id
    app.get("/comments/:blogId", async (req, res) => {
      const blogId = req.params.blogId;
      try {
        const comments = await commentsCollection
          .find({ blogId: blogId })
          .sort({ time: -1 })
          .toArray();
        res.send(comments);
      } catch (error) {
        console.error("Error fetching comments:", error);
        res.status(500).send({ error: "Failed to fetch comments" });
      }
    });

    // POST: Add a reply to an existing comment
    app.post("/replies", async (req, res) => {
      try {
        const { commentId, name, email, text, blogId } = req.body;

        if (!commentId || !name || !email || !text || !blogId) {
          return res.status(400).json({ error: "Missing required fields" });
        }

        const reply = {
          name,
          email,
          text,
          date: new Date().toISOString(),
        };

        // Update the comment with the new reply
        const result = await commentsCollection.updateOne(
          { _id: new ObjectId(commentId), blogId },
          { $push: { replies: reply } }
        );

        if (result.modifiedCount > 0) {
          res.status(201).json(reply);
        } else {
          res.status(500).json({ error: "Failed to post reply" });
        }
      } catch (error) {
        console.error("Error posting reply:", error);
        res.status(500).json({ error: "Failed to post reply" });
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
