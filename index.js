import express from 'express';
import 'dotenv/config';
import { timingSafeEqual } from 'node:crypto';
import { MongoClient, ObjectId } from 'mongodb';
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

function requireStudioService(req, res, next) {
    const configuredSecret = process.env.BOOKING_API_SECRET;
    const providedSecret = req.get('x-booking-api-secret');
    const ownerEmail = req.get('x-studio-owner-email')?.trim().toLowerCase();

    if (!configuredSecret) {
        return res.status(503).json({ message: 'Studio mutations are not configured.' });
    }

    const expected = Buffer.from(configuredSecret);
    const provided = Buffer.from(providedSecret || '');
    if (
        expected.length !== provided.length ||
        !timingSafeEqual(expected, provided) ||
        !ownerEmail
    ) {
        return res.status(401).json({ message: 'You are not authorized to change studio listings.' });
    }

    req.studioOwnerEmail = ownerEmail;
    return next();
}

const studioCategories = new Set([
    'Photo Studio',
    'Film Stage',
    'Podcast Lounge',
    'Music Suite',
    'Workshop',
]);

const studioAmenities = new Set([
    'Professional Lighting',
    'Changing Room',
    'Makeup Station',
    'Air Conditioning',
    'Wi-Fi',
    'Backdrops',
    'Tripods & Stands',
    'Props',
    'Restroom',
    'Parking',
]);

function isValidImageUrl(value) {
    if (typeof value !== 'string') return false;

    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

function isValidStudioDetails(studio) {
    return (
        typeof studio.title === 'string' &&
        Boolean(studio.title.trim()) &&
        studio.title.trim().length <= 120 &&
        typeof studio.category === 'string' &&
        studioCategories.has(studio.category) &&
        typeof studio.hourlyRate === 'number' &&
        Number.isFinite(studio.hourlyRate) &&
        studio.hourlyRate > 0 &&
        typeof studio.rating === 'number' &&
        Number.isFinite(studio.rating) &&
        studio.rating >= 0 &&
        studio.rating <= 5 &&
        typeof studio.securityDeposit === 'number' &&
        Number.isFinite(studio.securityDeposit) &&
        studio.securityDeposit >= 0 &&
        typeof studio.maxCapacity === 'number' &&
        Number.isInteger(studio.maxCapacity) &&
        studio.maxCapacity >= 1 &&
        typeof studio.location === 'string' &&
        Boolean(studio.location.trim()) &&
        isValidImageUrl(studio.imageUrl) &&
        Array.isArray(studio.amenities) &&
        studio.amenities.every(
            (amenity) => typeof amenity === 'string' && studioAmenities.has(amenity),
        ) &&
        typeof studio.overview === 'string' &&
        Boolean(studio.overview.trim()) &&
        studio.overview.trim().length <= 4000
    );
}

const editableStudioFields = [
    'title',
    'category',
    'hourlyRate',
    'securityDeposit',
    'maxCapacity',
    'rating',
    'location',
    'imageUrl',
    'amenities',
    'overview',
];

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

app.post('/studios', requireStudioService, async (req, res) => {
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
    } = req.body ?? {};

    if (
        typeof title !== 'string' ||
        !title.trim() ||
        title.trim().length > 120 ||
        typeof category !== 'string' ||
        !studioCategories.has(category) ||
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
        !isValidImageUrl(imageUrl) ||
        !Array.isArray(amenities) ||
        !amenities.every((amenity) => typeof amenity === 'string' && studioAmenities.has(amenity)) ||
        typeof overview !== 'string' ||
        !overview.trim() ||
        overview.trim().length > 4000
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
        ownerEmail: req.studioOwnerEmail,
        ownerName: typeof req.body.ownerName === 'string' && req.body.ownerName.trim()
            ? req.body.ownerName.trim()
            : req.studioOwnerEmail,
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

async function updateStudio(req, res) {
    const { id } = req.params;
    if (!/^[a-f\d]{24}$/i.test(id)) {
        return res.status(400).json({ message: 'Please provide a valid studio ID.' });
    }

    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        return res.status(400).json({ message: 'Please provide valid studio details.' });
    }

    if (
        req.method === 'PUT' &&
        editableStudioFields.some((field) => !Object.hasOwn(req.body, field))
    ) {
        return res.status(400).json({ message: 'Please provide all required studio details.' });
    }

    try {
        const studios = await getStudiosCollection();
        const studioId = new ObjectId(id);
        const currentStudio = await studios.findOne({
            _id: studioId,
            ownerEmail: req.studioOwnerEmail,
        });

        if (!currentStudio) {
            return res.status(404).json({ message: 'Studio listing not found.' });
        }

        const updates = Object.fromEntries(
            editableStudioFields
                .filter((field) => Object.hasOwn(req.body, field))
                .map((field) => [field, req.body[field]]),
        );
        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ message: 'No editable studio details were provided.' });
        }

        const updatedStudio = { ...currentStudio, ...updates };
        if (!isValidStudioDetails(updatedStudio)) {
            return res.status(400).json({ message: 'Please provide valid studio details.' });
        }

        updatedStudio.title = updatedStudio.title.trim();
        updatedStudio.location = updatedStudio.location.trim();
        updatedStudio.imageUrl = updatedStudio.imageUrl.trim();
        updatedStudio.amenities = [...new Set(updatedStudio.amenities)];
        updatedStudio.overview = updatedStudio.overview.trim();
        updatedStudio.updatedAt = new Date().toISOString();

        await studios.updateOne(
            { _id: studioId, ownerEmail: req.studioOwnerEmail },
            {
                $set: Object.fromEntries(
                    [...editableStudioFields, 'updatedAt'].map((field) => [
                        field,
                        updatedStudio[field],
                    ]),
                ),
            },
        );

        return res.json({
            message: 'Studio updated successfully.',
            studio: updatedStudio,
        });
    } catch (error) {
        console.error('Failed to update studio listing:', error);
        return res.status(500).json({ message: 'Could not update the studio listing.' });
    }
}

async function deleteStudio(req, res) {
    const { id } = req.params;
    if (!/^[a-f\d]{24}$/i.test(id)) {
        return res.status(400).json({ message: 'Please provide a valid studio ID.' });
    }

    try {
        const studios = await getStudiosCollection();
        const result = await studios.deleteOne({
            _id: new ObjectId(id),
            ownerEmail: req.studioOwnerEmail,
        });

        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'Studio listing not found.' });
        }

        return res.json({ message: 'Studio listing deleted successfully.' });
    } catch (error) {
        console.error('Failed to delete studio listing:', error);
        return res.status(500).json({ message: 'Could not delete the studio listing.' });
    }
}

app.route('/studios/:id')
    .put(requireStudioService, updateStudio)
    .patch(requireStudioService, updateStudio)
    .delete(requireStudioService, deleteStudio);

if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
}

export default app;