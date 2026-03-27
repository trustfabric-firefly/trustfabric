import express from 'express';
import { Request, Response } from 'express';
import { db } from './firebase'; // Assuming you have a firebase.ts that exports a db instance

const router = express.Router();

// Example route to get data from Firestore
router.get('/data', async (req: Request, res: Response) => {
    try {
        const snapshot = await db.collection('your-collection-name').get();
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.status(200).json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch data' });
    }
});

// Example route to add data to Firestore
router.post('/data', async (req: Request, res: Response) => {
    try {
        const newData = req.body;
        const docRef = await db.collection('your-collection-name').add(newData);
        res.status(201).json({ id: docRef.id, ...newData });
    } catch (error) {
        res.status(500).json({ error: 'Failed to add data' });
    }
});

// Export the router
export default router;