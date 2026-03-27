import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as serviceAccount from './service-firebase.json';

// Initialize the Firebase app
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
});

// Example HTTP trigger
export const helloWorld = functions.https.onRequest((request, response) => {
  response.send("Hello from Firebase!");
});

// Additional routes can be imported and used here
// import { someRoute } from './routes';
// app.use('/api', someRoute);