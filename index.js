import express from 'express';
import 'dotenv/config';
import { MongoClient } from 'mongodb';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 5000;


app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Hello, World!');
});


const client = new MongoClient(process.env.MONGODB_URL);
export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}

const mongoClient = await connectToMongoDB();
const db = mongoClient.db("studio_Space");
const destinationsCollection = db.collection("studios");



app.get('/studios', async (req, res) => {
    const result = await destinationsCollection.find({}).toArray();
    res.send(result);
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});