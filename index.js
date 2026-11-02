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


let studiosCollectionPromise;

async function getStudiosCollection() {
  const mongodbUrl = process.env.MONGODB_URL;
  if (!mongodbUrl) {
    throw new Error('MONGODB_URL environment variable is required.');
  }

  if (!studiosCollectionPromise) {
    const client = new MongoClient(mongodbUrl);
    studiosCollectionPromise = client.connect()
      .then(() => client.db('studio_Space').collection('studios'))
      .catch((error) => {
        studiosCollectionPromise = undefined;
        throw error;
      });
  }

  return studiosCollectionPromise;
}

app.get('/studios', async (req, res) => {
    try {
        const destinationsCollection = await getStudiosCollection();
        const result = await destinationsCollection.find({}).toArray();
        return res.json(result);
    } catch (error) {
        console.error('Failed to retrieve studio listings:', error);
        return res.status(500).json({ message: 'Could not retrieve studio listings.' });
    }
});

app.post('/studios', async (req, res) => {
    const {
        title,
        category,
        hourlyRate,
        securityDeposit,
        maxCapacity,
        rating = 0,
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
        typeof rating !== 'number' ||
        !Number.isFinite(rating) ||
        rating < 0 ||
        rating > 5 ||
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
        rating,
        location: location.trim(),
        imageUrl: imageUrl.trim(),
        amenities: [...new Set(amenities.map((amenity) => amenity.trim()).filter(Boolean))],
        overview: overview.trim(),
        ownerEmail: ownerEmail.trim().toLowerCase(),
        ownerName: ownerName.trim(),
        reviewCount: 0,
        isAvailable: true,
        createdAt: new Date().toISOString(),
    };

    try {
        const destinationsCollection = await getStudiosCollection();
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

if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
}

export default app;