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

app.post('/studios', async (req, res) => {
    const {
        title,
        category,
        hourlyRate,
        securityDeposit,
        maxCapacity,
        location,
        imageUrl,
        amenities,
        overview,
        ownerEmail,
        ownerName,
    } = req.body ?? {};

    const validImageUrl = (value) => {
        if (typeof value !== 'string') return false;

        try {
            const url = new URL(value);
            return url.protocol === 'http:' || url.protocol === 'https:';
        } catch {
            return false;
        }
    };

    if (
        typeof title !== 'string' ||
        !title.trim() ||
        title.trim().length > 120 ||
        typeof category !== 'string' ||
        !category.trim() ||
        typeof hourlyRate !== 'number' ||
        !Number.isFinite(hourlyRate) ||
        hourlyRate <= 0 ||
        typeof securityDeposit !== 'number' ||
        !Number.isFinite(securityDeposit) ||
        securityDeposit < 0 ||
        typeof maxCapacity !== 'number' ||
        !Number.isInteger(maxCapacity) ||
        maxCapacity < 1 ||
        typeof location !== 'string' ||
        !location.trim() ||
        !validImageUrl(imageUrl) ||
        !Array.isArray(amenities) ||
        !amenities.every((amenity) => typeof amenity === 'string') ||
        typeof overview !== 'string' ||
        !overview.trim() ||
        overview.trim().length > 4000 ||
        typeof ownerEmail !== 'string' ||
        !ownerEmail.trim() ||
        typeof ownerName !== 'string' ||
        !ownerName.trim()
    ) {
        return res.status(400).json({ message: 'Please provide valid studio details.' });
    }

    const studio = {
        title: title.trim(),
        category: category.trim(),
        hourlyRate,
        securityDeposit,
        maxCapacity,
        location: location.trim(),
        imageUrl: imageUrl.trim(),
        amenities: [...new Set(amenities.map((amenity) => amenity.trim()).filter(Boolean))],
        overview: overview.trim(),
        ownerEmail: ownerEmail.trim().toLowerCase(),
        ownerName: ownerName.trim(),
        rating: 0,
        reviewCount: 0,
        isAvailable: true,
        createdAt: new Date().toISOString(),
    };

    try {
        const result = await destinationsCollection.insertOne(studio);
        return res.status(201).json({
            message: 'Studio created successfully.',
            studio: { ...studio, _id: result.insertedId },
        });
    } catch (error) {
        console.error('Failed to save studio listing:', error);
        return res.status(500).json({ message: 'Could not save the studio listing.' });
    }
});


app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});