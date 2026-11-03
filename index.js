import express from 'express';
import 'dotenv/config';
import { MongoClient, ObjectId } from 'mongodb';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { requireAuth } from './middleware/require-auth.js';

const app = express();
const PORT = process.env.PORT || 5000;
const allowedOrigins = new Set(
  (process.env.FRONTEND_ORIGINS || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000'))
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
);

app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
      if (!origin) return callback(null, false);
      if (allowedOrigins.has(origin)) return callback(null, origin);
      return callback(new Error('Origin is not allowed.'));
  },
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json({ limit: '64kb', strict: true }));

const mutationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

app.get('/', (_req, res) => {
  res.send('Hello, World!');
});


let mongoDatabasePromise;

async function getMongoDatabase() {
  const mongodbUrl = process.env.MONGODB_URL;
  if (!mongodbUrl) {
    throw new Error('MONGODB_URL environment variable is required.');
  }

  if (!mongoDatabasePromise) {
    const client = new MongoClient(mongodbUrl);
    mongoDatabasePromise = client.connect()
      .then(() => client.db('studio_Space'))
      .catch((error) => {
        mongoDatabasePromise = undefined;
        throw error;
      });
  }

  return mongoDatabasePromise;
}

async function getStudiosCollection() {
  return (await getMongoDatabase()).collection('studios');
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

const studioSchema = z.object({
    title: z.string().trim().min(1).max(120),
    category: z.enum([...studioCategories]),
    hourlyRate: z.number().finite().positive(),
    securityDeposit: z.number().finite().nonnegative(),
    maxCapacity: z.number().int().positive(),
    rating: z.number().finite().min(0).max(5).default(0),
    location: z.string().trim().min(1).max(200),
    imageUrl: z.string().trim().url().refine((value) => ['http:', 'https:'].includes(new URL(value).protocol)),
    amenities: z.array(z.enum([...studioAmenities])).max(20),
    overview: z.string().trim().min(1).max(4000),
});

const studioPatchSchema = studioSchema.partial();
const studioIdSchema = z.string().regex(/^[a-f\d]{24}$/i);
const bookingStartSlots = ['09:00', '11:00', '13:00', '15:00', '17:00', '19:00'];
const bookingSchema = z.object({
    studioId: studioIdSchema,
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
        const parsed = new Date(`${value}T00:00:00.000Z`);
        return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
    }),
    startTime: z.enum(bookingStartSlots),
    durationHours: z.number().int().min(1).max(8),
});

function getStudioFilter(id) {
    return { _id: { $in: [id, new ObjectId(id)] } };
}

function getOwnedStudioFilter(id, user) {
    const filter = getStudioFilter(id);
    if (user.role === 'admin') return filter;

    return {
        ...filter,
        $or: [
            { ownerId: user.id },
            { ownerId: { $exists: false }, ownerEmail: { $regex: `^${user.email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } },
        ],
    };
}

function canManageStudio(studio, user) {
    if (user.role === 'admin') return true;
    if (studio.ownerId) return studio.ownerId === user.id;
    return studio.ownerEmail?.toLowerCase() === user.email;
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

app.post('/studios', mutationLimiter, requireAuth, async (req, res) => {
    const parsedStudio = studioSchema.safeParse(req.body);
    if (!parsedStudio.success) {
        return res.status(400).json({ message: 'Please provide valid studio details.' });
    }

    const { title, category, hourlyRate, securityDeposit, maxCapacity, rating, location, imageUrl, amenities, overview } = parsedStudio.data;
    const studio = {
        title,
        category,
        hourlyRate,
        securityDeposit,
        maxCapacity,
        rating,
        location,
        imageUrl,
        amenities: [...new Set(amenities)],
        overview,
        ownerId: req.user.id,
        ownerEmail: req.user.email,
        ownerName: req.user.name.trim() || req.user.email,
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
        console.error('Failed to save studio listing.');
        return res.status(500).json({ message: 'Could not save the studio listing.' });
    }
});

async function updateStudio(req, res) {
    const { id } = req.params;
    if (!studioIdSchema.safeParse(id).success) {
        return res.status(400).json({ message: 'Please provide a valid studio ID.' });
    }

    const parsedUpdates = studioPatchSchema.safeParse(req.body);
    if (!parsedUpdates.success) {
        return res.status(400).json({ message: 'Please provide valid studio details.' });
    }

    if (
        req.method === 'PUT' &&
        editableStudioFields.some((field) => !Object.hasOwn(parsedUpdates.data, field))
    ) {
        return res.status(400).json({ message: 'Please provide all required studio details.' });
    }

    try {
        const studios = await getStudiosCollection();
        const currentStudio = await studios.findOne(getStudioFilter(id));

        if (!currentStudio) {
            return res.status(404).json({ message: 'Studio listing not found.' });
        }
        if (!canManageStudio(currentStudio, req.user)) {
            return res.status(403).json({ message: 'You do not have permission to change this studio.' });
        }

        const updates = Object.fromEntries(
            editableStudioFields
                .filter((field) => Object.hasOwn(parsedUpdates.data, field))
                .map((field) => [field, parsedUpdates.data[field]]),
        );
        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ message: 'No editable studio details were provided.' });
        }

        const parsedStudio = studioSchema.safeParse({ ...currentStudio, ...updates });
        if (!parsedStudio.success) {
            return res.status(400).json({ message: 'Please provide valid studio details.' });
        }

        const updatedStudio = {
            ...currentStudio,
            ...parsedStudio.data,
            amenities: [...new Set(parsedStudio.data.amenities)],
        };
        updatedStudio.updatedAt = new Date().toISOString();

        await studios.updateOne(
            getStudioFilter(id),
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
        console.error('Failed to update studio listing.');
        return res.status(500).json({ message: 'Could not update the studio listing.' });
    }
}

async function deleteStudio(req, res) {
    const { id } = req.params;
    if (!studioIdSchema.safeParse(id).success) {
        return res.status(400).json({ message: 'Please provide a valid studio ID.' });
    }

    try {
        const studios = await getStudiosCollection();
        const studio = await studios.findOne(getStudioFilter(id));

        if (!studio) {
            return res.status(404).json({ message: 'Studio listing not found.' });
        }
        if (!canManageStudio(studio, req.user)) {
            return res.status(403).json({ message: 'You do not have permission to delete this studio.' });
        }

        await studios.deleteOne({ _id: studio._id });

        return res.json({ message: 'Studio listing deleted successfully.' });
    } catch (error) {
        console.error('Failed to delete studio listing.');
        return res.status(500).json({ message: 'Could not delete the studio listing.' });
    }
}

app.route('/studios/:id')
    .put(mutationLimiter, requireAuth, updateStudio)
    .patch(mutationLimiter, requireAuth, updateStudio)
    .delete(mutationLimiter, requireAuth, deleteStudio);

app.post('/bookings', mutationLimiter, requireAuth, async (req, res) => {
    const parsedBooking = bookingSchema.safeParse(req.body);
    if (!parsedBooking.success) {
        return res.status(400).json({ message: 'Please check the booking date and time.' });
    }

    const input = parsedBooking.data;
    if (input.date < new Date().toISOString().slice(0, 10)) {
        return res.status(400).json({ message: 'Booking dates must be today or later.' });
    }
    const startMinutes = Number(input.startTime.slice(0, 2)) * 60;
    if (startMinutes + input.durationHours * 60 > 24 * 60) {
        return res.status(400).json({ message: 'The booking duration extends past midnight.' });
    }

    try {
        const studios = await getStudiosCollection();
        const studio = await studios.findOne(getStudioFilter(input.studioId));
        if (!studio) {
            return res.status(404).json({ message: 'This studio could not be found.' });
        }
        if (!studio.isAvailable) {
            return res.status(409).json({ message: 'This studio is not available for booking.' });
        }
        if (
            !Number.isFinite(studio.hourlyRate) ||
            studio.hourlyRate <= 0 ||
            !Number.isFinite(studio.securityDeposit) ||
            studio.securityDeposit < 0
        ) {
            return res.status(502).json({ message: 'The studio price could not be verified. Please try again later.' });
        }

        const database = await getMongoDatabase();
        const slots = database.collection('bookingSlots');
        const bookings = database.collection('bookings');
        const bookingId = new ObjectId();
        const date = input.date;
        const [hours, minutes] = input.startTime.split(':').map(Number);
        const startHour = hours + minutes / 60;
        const requestedSlots = Array.from({ length: input.durationHours }, (_, index) => startHour + index);

        await slots.createIndex(
            { studioId: 1, date: 1, hour: 1 },
            { unique: true, name: 'unique_studio_booking_hour' },
        );
        try {
            await slots.insertMany(requestedSlots.map((hour) => ({
                studioId: studio._id,
                date,
                hour,
                bookingId,
            })));
        } catch (error) {
            await slots.deleteMany({ bookingId });
            if (error?.code === 11000) {
                return res.status(409).json({ message: 'That time overlaps another reservation. Please choose another time.' });
            }
            throw error;
        }

        const hourlyRate = studio.hourlyRate;
        const securityDeposit = studio.securityDeposit;
        const total = hourlyRate * input.durationHours + securityDeposit;
        const now = new Date();
        const normalizedEmail = req.user.email;
        const userName = req.user.name.trim() || normalizedEmail;
        const record = {
            _id: bookingId,
            bookingId: bookingId.toHexString(),
            studioId: studio._id,
            studioTitle: studio.title,
            studioImage: studio.imageUrl,
            studioCategory: studio.category,
            studio: {
                id: studio._id.toString(),
                title: studio.title,
                category: studio.category,
                location: studio.location,
                imageUrl: studio.imageUrl,
                hourlyRate,
                securityDeposit,
            },
            date,
            bookingDate: date,
            startTime: input.startTime,
            bookingTimeSlot: {
                startTime: input.startTime,
                endTime: `${String(hours + input.durationHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
                durationHours: input.durationHours,
            },
            durationHours: input.durationHours,
            hourlyRate,
            securityDeposit,
            total,
            totalPrice: total,
            status: 'Pending',
            bookingStatus: 'Pending',
            userName,
            userEmail: normalizedEmail,
            ...(req.user.image ? { userImage: req.user.image } : {}),
            user: {
                id: req.user.id,
                name: userName,
                email: normalizedEmail,
                ...(req.user.image ? { image: req.user.image } : {}),
            },
            createdAt: now,
            updatedAt: now,
        };

        try {
            await bookings.insertOne(record);
        } catch (error) {
            await slots.deleteMany({ bookingId });
            throw error;
        }

        return res.status(201).json({
            ...record,
            id: bookingId.toString(),
            _id: undefined,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
        });
    } catch (error) {
        console.error('Failed to create booking.');
        return res.status(500).json({ message: 'The booking could not be saved. Please try again.' });
    }
});

app.use((req, res) => {
    return res.status(404).json({ error: 'Not Found' });
});

app.use((error, _req, res, _next) => {
    if (res.headersSent) return;
    if (error?.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'Invalid JSON body.' });
    }
    if (error?.type === 'entity.too.large') {
        return res.status(413).json({ error: 'Request body is too large.' });
    }
    if (error?.message === 'Origin is not allowed.') {
        return res.status(403).json({ error: 'Origin is not allowed.' });
    }
    return res.status(error?.status === 503 ? 503 : 500).json({ error: 'An unexpected error occurred.' });
});

if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
}

export default app;